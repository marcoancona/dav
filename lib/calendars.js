import co from 'co';
import url from 'url';

import fuzzyUrlEquals from './fuzzy_url_equals';
import { Calendar, CalendarObject } from './model';
import * as ns from './namespace';
import * as request from './request';
import * as webdav from './webdav';

let debug = require('./debug').default('dav:calendars');

const ICAL_OBJS = new Set([
  'VEVENT',
  'VTODO',
  'VJOURNAL',
  'VFREEBUSY',
  'VTIMEZONE',
  'VALARM',
]);

/**
 * @param {dav.Account} account to fetch calendars for.
 */
export let listCalendars = co.wrap(function* (account, options) {
  debug(`Fetch calendars from home url ${account.homeUrl}`);
  let req = request.propfind({
    props: [
      { name: 'calendar-description', namespace: ns.CALDAV },
      { name: 'calendar-timezone', namespace: ns.CALDAV },
      { name: 'displayname', namespace: ns.DAV },
      { name: 'getctag', namespace: ns.CALENDAR_SERVER },
      { name: 'resourcetype', namespace: ns.DAV },
      { name: 'supported-calendar-component-set', namespace: ns.CALDAV },
      { name: 'sync-token', namespace: ns.DAV },
      { name: 'calendar-color', namespace: ns.APPLE },
      { name: 'current-user-privilege-set', namespace: ns.DAV },
    ],
    depth: 1,
  });

  let responses = yield options.xhr.send(req, account.homeUrl, {
    sandbox: options.sandbox,
  });

  debug(`Found ${responses.length} calendars.`);
  let cals = responses
    .filter((res) => {
      // We only want the calendar if it contains iCalendar objects.
      let resourcetype = res.props.resourcetype || [];
      return resourcetype.indexOf('calendar') !== -1;
    })
    .map((res) => {
      debug(`Found calendar ${res.props.displayname},
             props: ${JSON.stringify(res.props)}`);
      return new Calendar({
        data: res,
        account: account,
        description: res.props.calendarDescription,
        timezone: res.props.calendarTimezone,
        color: res.props.calendarColor,
        url: url.resolve(account.principalUrl, res.href),
        ctag: res.props.getctag,
        displayName: res.props.displayname,
        components: res.props.supportedCalendarComponentSet,
        resourcetype: res.props.resourcetype,
        syncToken: res.props.syncToken,
        currentUserPrivilegeSet: res.props.currentUserPrivilegeSet,
      });
    });

  yield cals.map(
    co.wrap(function* (cal) {
      cal.reports = yield webdav.supportedReportSet(cal, options);
    })
  );

  return cals;
});

/**
 * @param {dav.Account} account to fetch calendars for.
 * @param {string} account to fetch calendars for.
 */
export let getCalendar = co.wrap(function* (account, calendarUrl, options) {
  debug(`Fetch calendar ${calendarUrl}`);
  let req = request.propfind({
    props: [
      { name: 'calendar-description', namespace: ns.CALDAV },
      { name: 'calendar-timezone', namespace: ns.CALDAV },
      { name: 'displayname', namespace: ns.DAV },
      { name: 'getctag', namespace: ns.CALENDAR_SERVER },
      { name: 'resourcetype', namespace: ns.DAV },
      { name: 'supported-calendar-component-set', namespace: ns.CALDAV },
      { name: 'sync-token', namespace: ns.DAV },
      { name: 'calendar-color', namespace: ns.APPLE },
      { name: 'current-user-privilege-set', namespace: ns.DAV },
    ],
    depth: 0,
  });

  let responses = yield options.xhr.send(req, calendarUrl, {
    sandbox: options.sandbox,
  });

  debug(`Found ${responses.length} calendars (expect 1).`);
  let cals = responses
    .filter((res) => {
      // We only want the calendar if it contains iCalendar objects.
      let resourcetype = res.props.resourcetype || [];
      return resourcetype.indexOf('calendar') !== -1;
    })
    .map((res) => {
      debug(`Found calendar ${res.props.displayname},
             props: ${JSON.stringify(res.props)}`);
      return new Calendar({
        data: res,
        account: account,
        description: res.props.calendarDescription,
        timezone: res.props.calendarTimezone,
        color: res.props.calendarColor,
        url: url.resolve(account.principalUrl, res.href),
        ctag: res.props.getctag,
        displayName: res.props.displayname,
        components: res.props.supportedCalendarComponentSet,
        resourcetype: res.props.resourcetype,
        syncToken: res.props.syncToken,
        currentUserPrivilegeSet: res.props.currentUserPrivilegeSet,
      });
    });

  yield cals.map(
    co.wrap(function* (cal) {
      cal.reports = yield webdav.supportedReportSet(cal, options);
    })
  );

  return cals.length ? cals[0] : null;
});

/**
 * @param {dav.Calendar} calendar the calendar to get the object from.
 * @return {Promise} promise will resolve when the event
 *
 * Options:
 *
 *   (String) href - href of the event to retrieve
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export function getCalendarObject(calendar, options) {
  if (!options.href) return null;
  options.hrefs = [options.href];
  return multigetSingleCalendarObject(calendar, options);
}

/**
 * @param {dav.Calendar} calendar the calendar to put the object on.
 * @return {Promise} promise will resolve when the calendar has been created.
 *
 * Options:
 *
 *   (String) data - rfc 5545 VCALENDAR object.
 *   (String) filename - name for the calendar ics file.
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export function createCalendarObject(calendar, options) {
  let objectUrl = url.resolve(calendar.url, options.filename);
  options.contentType = 'text/calendar';
  return webdav.createObject(objectUrl, options.data, options);
}

/**
 * @param {dav.CalendarObject} calendarObject updated calendar object.
 * @return {Promise} promise will resolve when the calendar has been updated.
 *
 * Options:
 *
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export function updateCalendarObject(calendarObject, options) {
  options.contentType = 'text/calendar';
  return webdav.updateObject(
    calendarObject.url,
    calendarObject.calendarData,
    calendarObject.etag,
    options
  );
}

/**
 * @param {dav.CalendarObject} calendarObject target calendar object.
 * @return {Promise} promise will resolve when the calendar has been deleted.
 *
 * Options:
 *
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export function deleteCalendarObject(calendarObject, options) {
  return webdav.deleteObject(calendarObject.url, calendarObject.etag, options);
}

/**
 * @param {dav.Calendar} calendar the calendar to fetch objects for.
 *
 * Options:
 *
 *   (Array.<Object>) filters - optional caldav filters.
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export let listCalendarObjects = co.wrap(function* (calendar, options) {
  debug(`Listing objects on calendar ${calendar.url} which belongs to
         ${calendar.account.credentials.username}`);

  let results = yield listCalendarObjectsEtags(calendar, options);
  options.hrefs = results
    .filter((res) => res.href && res.href.length)
    .map((res) => res.href);

  debug('Got the following etags:');
  debug(options.hrefs);

  // First query to get list of etags
  return yield multigetCalendarObjects(calendar, options);
});

/**
 * Fetch calendar objects that changed on the remote calendar since
 * the last sync. This includes added, modified and deleted calendar
 * objects. Changes will be recognized by comparing the etags in the
 * `calendar.objects` array with the etags fetched from the remote.
 *
 * @param {dav.Calendar} calendar the calendar to fetch objects for.
 *
 * Options:
 *
 *   (Array.<Object>) filters - optional caldav filters.
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export let syncCalendarObjects = co.wrap(function* (calendar, options) {
  debug(`Sync objects on calendar ${calendar.url} which belongs to
         ${calendar.account.credentials.username}`);

  // First we only fetch the etags and hrefs to figure out what changed locally
  let remoteCalendarObjects = yield listCalendarObjectsEtags(calendar, options);

  // Collect hrefs of all new and modified events
  const hrefs = [];

  // Compare local calendar objects with remote calendar objects
  const localEvents = calendar.objects;
  const remoteEvents = remoteCalendarObjects.filter(
    (obj) => obj.href && obj.href.length
  );
  remoteEvents.forEach((remoteEvent) => {
    // Check if remote event already exists locally
    const localEvent = localEvents.find((localEvent) =>
      fuzzyUrlEquals(localEvent.url, remoteEvent.href)
    );
    if (localEvent) {
      localEvent.exists = true;
      if (localEvent.etag !== remoteEvent.etag) {
        // Modified event
        hrefs.push(remoteEvent.href);
      }
      // If etag matches, event did not change -> don't push them
    } else {
      // New event
      hrefs.push(remoteEvent.href);
    }
  });
  // Get the calendar-data and etags of the events that are either new or changed
  options.hrefs = hrefs;
  const calendarObjects = yield multigetCalendarObjects(calendar, options);

  // Push deleted events
  localEvents.forEach((event) => {
    if (!event.exists) {
      calendarObjects.push(
        new CalendarObject({
          url: event.url,
          status: 'cancelled',
        })
      );
    }
  });
  return calendarObjects;
});

/**
 * @param {dav.Calendar} calendar the calendar to fetch etags for.
 *
 * Options:
 *
 *   (Array.<Object>) filters - optional caldav filters.
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export let listCalendarObjectsEtags = co.wrap(function* (calendar, options) {
  debug(`Getting etags on calendar ${calendar.url} which belongs to
         ${calendar.account.credentials.username}`);

  let filters = options.filters || [
    {
      type: 'comp-filter',
      attrs: { name: 'VCALENDAR' },
      children: [
        {
          type: 'comp-filter',
          attrs: { name: 'VEVENT' },
        },
      ],
    },
  ];

  // First query to get list of etags
  let req = request.calendarQuery({
    depth: 1,
    props: [{ name: 'getetag', namespace: ns.DAV }],
    filters: filters,
  });

  let responses = yield options.xhr.send(req, calendar.url, {
    sandbox: options.sandbox,
  });

  return responses.map((res) => {
    debug(`Found calendar object (etag only) with url ${res.href}`);
    return { href: res.href, etag: res.props.getetag };
  });
});

/**
 * @param {dav.Calendar} calendar the calendar to fetch objects for.
 *
 * Options:
 *
 *   (Array.<Object>) hrefs - hrefs of objects to retrieve.
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export let multigetCalendarObjects = co.wrap(function* (calendar, options) {
  debug(`Doing multiget on calendar ${calendar.url} which belongs to
         ${calendar.account.credentials.username}`);

  let hrefs = options.hrefs || [];

  if (!hrefs.length) return [];

  let req = request.calendarMultiget({
    depth: 1,
    props: [
      { name: 'getetag', namespace: ns.DAV },
      { name: 'calendar-data', namespace: ns.CALDAV },
    ],
    hrefs: hrefs.map((href) => ensureEncodedPath(href)),
  });

  let responses = yield options.xhr.send(req, calendar.url, {
    sandbox: options.sandbox,
  });

  return responses.map((res) => {
    //debug(`Found calendar object with url ${res.href}`);
    return new CalendarObject({
      data: res,
      calendar: calendar,
      url: url.resolve(calendar.account.principalUrl, res.href),
      etag: res.props.getetag,
      calendarData: res.props.calendarData,
    });
  });
});

export let multigetSingleCalendarObject = co.wrap(function* (
  calendar,
  options
) {
  let events = yield multigetCalendarObjects(calendar, options);
  return events.filter((event) => {
    // Find the response that corresponds to the parameter collection.
    return fuzzyUrlEquals(options.href, event.url);
  })[0];
});

/**
 * @param {dav.Calendar} calendar the calendar to fetch updates to.
 * @return {Promise} promise will resolve with updated calendar object.
 *
 * Options:
 *
 *   (Array.<Object>) filters - list of caldav filters to send with request.
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (String) syncMethod - either 'basic' or 'webdav'. If unspecified, will
 *       try to do webdav sync and failover to basic sync if rfc 6578 is not
 *       supported by the server.
 *   (String) timezone - VTIMEZONE calendar object.
 *   (dav.Transport) xhr - request sender.
 */
export function syncCalendar(calendar, options) {
  options.basicSync = basicSync;
  options.webdavSync = webdavSync;
  return webdav.syncCollection(calendar, options);
}

/**
 * @param {dav.Account} account the account to fetch updates for.
 * @return {Promise} promise will resolve with updated account.
 *
 * Options:
 *
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (dav.Transport) xhr - request sender.
 */
export let syncCaldavAccount = co.wrap(function* (account, options = {}) {
  options.loadObjects = false;
  if (!account.calendars) account.calendars = [];

  let cals = yield listCalendars(account, options);
  cals
    .filter((cal) => {
      // Filter the calendars not previously seen.
      return account.calendars.every(
        (prev) => !fuzzyUrlEquals(prev.url, cal.url)
      );
    })
    .forEach((cal) => {
      // Add them to the account's calendar list.
      account.calendars.push(cal);
    });

  options.loadObjects = true;
  yield account.calendars.map(
    co.wrap(function* (cal, index) {
      try {
        yield syncCalendar(cal, options);
      } catch (error) {
        debug(`Sync calendar ${cal.displayName} failed with ${error}`);
        account.calendars.splice(index, 1);
      }
    })
  );

  return account;
});

/**
 * Extract the path from the full spec, if the regexp failed, log
 * warning and return unaltered path.
 */
let extractPathFromSpec = (aSpec) => {
  // The parsed array should look like this:
  // a[0] = full string
  // a[1] = scheme
  // a[2] = everything between the scheme and the start of the path
  // a[3] = extracted path
  let a = aSpec.match('(https?)(://[^/]*)([^#?]*)');
  if (a && a[3]) {
    return a[3];
  }
  debug('CalDAV: Spec could not be parsed, returning as-is: ' + aSpec);
  return aSpec;
};

/**
 * This is called to create an encoded path from a unencoded path OR
 * encoded full url
 *
 * @param aString {string} un-encoded path OR encoded uri spec.
 */
let ensureEncodedPath = (aString) => {
  if (aString.charAt(0) != '/') {
    aString = ensureDecodedPath(aString);
  }
  let uriComponents = aString.split('/');
  uriComponents = uriComponents.map(encodeURIComponent);
  return uriComponents.join('/');
};

/**
 * This is called to get a decoded path from an encoded path or uri spec.
 *
 * @param {string} aString - Represents either a path
 *                           or a full uri that needs to be decoded.
 * @return {string} A decoded path.
 */
let ensureDecodedPath = (aString) => {
  if (aString.charAt(0) != '/') {
    aString = extractPathFromSpec(aString);
  }

  let uriComponents = aString.split('/');
  for (let i = 0; i < uriComponents.length; i++) {
    try {
      uriComponents[i] = decodeURIComponent(uriComponents[i]);
    } catch (e) {
      debug(
        'CalDAV: Exception decoding path ' +
          aString +
          ', segment: ' +
          uriComponents[i]
      );
    }
  }
  return uriComponents.join('/');
};

let basicSync = co.wrap(function* (calendar, options) {
  let sync = yield webdav.isCollectionDirty(calendar, options);
  if (!sync) {
    debug('Local ctag matched remote! No need to sync :).');
    return calendar;
  }

  debug('ctag changed so we need to fetch stuffs.');
  calendar.objects = yield syncCalendarObjects(calendar, options);
  return calendar;
});

let webdavSync = co.wrap(function* (calendar, options) {
  let req = request.syncCollection({
    props: [
      { name: 'getetag', namespace: ns.DAV },
      //{ name: 'calendar-data', namespace: ns.CALDAV }
    ],
    syncLevel: 1,
    syncToken: calendar.syncToken,
    depth: 1,
  });

  let result = yield options.xhr.send(req, calendar.url, {
    sandbox: options.sandbox,
  });

  // Results contains new, modified or deleted objects.
  result.responses.forEach((res) => {
    // Validate href
    if (res.href && res.href.length) {
      res.href = ensureDecodedPath(res.href);
    }
    // Validate contenttype
    if (
      (!res.getcontenttype || res.getcontenttype === 'text/plain') &&
      res.href &&
      res.href.endsWith('.ics')
    ) {
      // If there is no content-type (iCloud) or text/plain was passed
      // (iCal Server) for the resource but its name ends with ".ics"
      // assume the content type to be text/calendar. Apple
      // iCloud/iCal Server interoperability fix.
      res.getcontenttype = 'text/calendar';
    }
  });

  let deletedHrefs = result.responses
    .filter(
      (res) =>
        res.href &&
        res.href.length &&
        res.status &&
        res.status.length &&
        res.status.indexOf('404') > -1
    )
    .map((res) => res.href);
  let newUpdatedHrefs = result.responses
    .filter((res) => !res.status || res.status.indexOf('404') === -1)
    .map((res) => res.href);

  // Starting from Feb 2020, iCloud sends 500 if hrefs contain the calendar one, despite providing the other data correctly!
  // TODO: Is this supposed to be the standard??
  if (calendar.url.indexOf('icloud.com') > -1) {
    newUpdatedHrefs = newUpdatedHrefs.filter(
      (href) => href.indexOf('.ics') > -1
    );
  }

  req = request.calendarMultiget({
    props: [
      { name: 'getetag', namespace: ns.DAV },
      { name: 'calendar-data', namespace: ns.CALDAV },
    ],
    depth: 1,
    hrefs: newUpdatedHrefs.map((href) => ensureEncodedPath(href)),
  });

  let results = yield options.xhr.send(req, calendar.url, {
    sandbox: options.sandbox,
  });

  // Calendar objects array will contain all new, modified and deleted events
  calendar.objects = [];
  results.forEach(function (response) {
    if (response.href && response.href.length) {
      response.href = ensureDecodedPath(response.href);
    } else return;

    if (!response.props.calendarData || !response.props.calendarData.length)
      return;

    // Push new and modified events
    calendar.objects.push(
      new CalendarObject({
        data: response,
        calendar: calendar,
        url: url.resolve(calendar.url, response.href),
        etag: response.props.getetag,
        calendarData: response.props.calendarData,
      })
    );
  });

  // Push deleted events
  deletedHrefs.forEach((deletedHref) => {
    calendar.objects.push(
      new CalendarObject({
        url: url.resolve(calendar.url, deletedHref),
        status: 'cancelled',
      })
    );
  });

  // Update token
  calendar.syncToken = result.syncToken;
  return calendar;
});
