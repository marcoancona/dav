import prop from './prop';
import href from './href';

export default function calendarMultiget(object) {
  return `<c:calendar-multiget xmlns:d="DAV:"
                               xmlns:c="urn:ietf:params:xml:ns:caldav">
    <d:prop>
      ${object.props.map(prop)}
    </d:prop>
    ${object.hrefs.map(href)}
  </c:calendar-multiget>`;
}
