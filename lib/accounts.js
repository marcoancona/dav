import co from 'co';
import url from 'url';

import { listCalendars, listCalendarObjects } from './calendars';
import { listAddressBooks, listVCards } from './contacts';
import fuzzyUrlEquals from './fuzzy_url_equals';
import { Account } from './model';
import * as ns from './namespace';
import * as request from './request';

let debug = require('./debug').default('dav:accounts');

let defaults = {
  accountType: 'caldav',
  loadCollections: true,
  loadObjects: false
};

/**
 * rfc 6764.
 *
 * @param {dav.Account} account to find root url for.
 */
let serviceDiscovery = co.wrap(function *(account, options) {
  debug('Attempt service discovery.');

  let endpoint = url.parse(account.server);
  endpoint.protocol = endpoint.protocol || 'http';  // TODO(gareth) https?

  let uri = url.format({
    protocol: endpoint.protocol,
    host: endpoint.host,
    pathname: `/.well-known/${options.accountType}`
  });

  let req = request.basic({ method: 'GET' });
  try {
    let xhr = yield options.xhr.send(req, uri, { sandbox: options.sandbox, followRedirect: false });
    if (xhr.status >= 300 && xhr.status < 400) {
      // http redirect.
      let location = xhr.getResponseHeader('Location');
      if (typeof location === 'string' && location.length) {
        debug(`Discovery redirected to ${location}`);
        return url.resolve(url.format({
          protocol: endpoint.protocol,
          host: endpoint.host
        }), location);
      }
    }
  } catch (error) {
    debug('Discovery failed... failover to the provided url');
  }

  return endpoint.href;
});

/**
 * rfc 5397.
 *
 * @param {dav.Account} account to get principal url for.
 */
let principalUrl = co.wrap(function *(account, options) {
  debug(`Fetch principal url from context path (rootUrl) ${account.rootUrl}.`);
  let req = request.propfind({
    props: [
	    { name: 'current-user-principal', namespace: ns.DAV },
	    { name: 'owner', namespace: ns.DAV }
    ],
    depth: 0,
    mergeResponses: true
  });

  let res = yield options.xhr.send(req, account.rootUrl, {
    sandbox: options.sandbox
  });

  let container = res.props;
  let principal = container.currentUserPrincipal || container.owner;
  debug(`Received principal: ${principal}`)
  return url.resolve(account.rootUrl, principal);
});

/**
 * @param {dav.Account} account to get home url for.
 */
let homeUrl = co.wrap(function *(account, options) {
  debug(`Fetch home url from principal url ${account.principalUrl}.`);
  let prop;
  if (options.accountType === 'caldav') {
    prop = { name: 'calendar-home-set', namespace: ns.CALDAV };
  } else if (options.accountType === 'carddav') {
    prop = { name: 'addressbook-home-set', namespace: ns.CARDDAV };
  }

  var req = request.propfind({ props: [ prop ], depth: 0});

  let responses = yield options.xhr.send(req, account.principalUrl, {
    sandbox: options.sandbox
  });

  let response = responses.find(response => {
    return fuzzyUrlEquals(account.principalUrl, response.href);
  });

  debug(`homeUrl parsed response:`)
  debug(JSON.stringify(response))

  let container = response.props;
  let href;
  if (options.accountType === 'caldav') {
    debug(`Received home: ${container.calendarHomeSet}`);
    href = container.calendarHomeSet;
  } else if (options.accountType === 'carddav') {
    debug(`Received home: ${container.addressbookHomeSet}`);
    href = container.addressbookHomeSet;
  }

  return url.resolve(account.principalUrl, href);
});

/**
 * @param {dav.Account} account to address set
 */
let addressSet = co.wrap(function *(account, options) {
	debug(`Fetch address set from principal url ${account.principalUrl}.`);
	let prop = { name: 'calendar-user-address-set', namespace: ns.CALDAV };

	var req = request.propfind({ props: [ prop ], depth: 0});

	let responses = yield options.xhr.send(req, account.principalUrl, {
		sandbox: options.sandbox
	});

	let response = responses.find(response => {
		return fuzzyUrlEquals(account.principalUrl, response.href);
	});

	return response.props.calendarUserAddressSet;
});

/**
 * Options:
 *
 *   (String) accountType - one of 'caldav' or 'carddav'. Defaults to 'caldav'.
 *   (Array.<Object>) filters - list of caldav filters to send with request.
 *   (Boolean) loadCollections - whether or not to load dav collections.
 *   (Boolean) loadObjects - whether or not to load dav objects.
 *   (dav.Sandbox) sandbox - optional request sandbox.
 *   (String) server - some url for server (needn't be base url).
 *   (String) timezone - VTIMEZONE calendar object.
 *   (dav.Transport) xhr - request sender.
 *
 * @return {Promise} a promise that will resolve with a dav.Account object.
 */
exports.createAccount = co.wrap(function *(options) {
  options = Object.assign({}, defaults, options);
  if (typeof options.loadObjects !== 'boolean') {
    options.loadObjects = options.loadCollections;
  }

  let account = new Account({
    server: options.server,
    credentials: options.xhr.credentials
  });

  if (options.discoveryEnabled) {
    debug(`Connecting with autodiscovery from ${options.server}`)
    account.rootUrl = yield serviceDiscovery(account, options);
    account.principalUrl = yield principalUrl(account, options);
  }
  else if (options.principalUrl) {
    debug(`Principal is provided: ${options.principalUrl}`)
    account.principalUrl = options.principalUrl;
  }
  else {
    debug(`Getting principal from provided root url without autodiscovery: ${options.server}`)
    account.rootUrl = options.server;
    account.principalUrl = yield principalUrl(account, options);
  }

  account.homeUrl = yield homeUrl(account, options);
  if (options.accountType === 'caldav') {
    account.addresses = yield addressSet(account, options);
  }

  if (!options.loadCollections) {
    return account;
  }

  let key, loadCollections, loadObjects;
  if (options.accountType === 'caldav') {
    key = 'calendars';
    loadCollections = listCalendars;
    loadObjects = listCalendarObjects;
  } else if (options.accountType === 'carddav') {
    key = 'addressBooks';
    loadCollections = listAddressBooks;
    loadObjects = listVCards;
  }

  var collections = yield loadCollections(account, options);
  account[key] = collections;
  if (!options.loadObjects) {
    return account;
  }

  yield collections.map(co.wrap(function *(collection) {
    try {
      collection.objects = yield loadObjects(collection, options);
    } catch (error) {
      collection.error = error;
    }
  }));

  account[key] = account[key].filter(function(collection) {
    return !collection.error;
  });

  return account;
});
