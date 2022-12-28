var url;
try {
  const src = docment.currentScript.src;
  if (src) {
    url = src;
  } else {
    null.split();
  }
} catch(e) {
	if ( e.fileName ) {
        url = e.fileName;
    } else if ( e.sourceURL ) {
		url = e.sourceURL;
	} else if ( e.stacktrace ) {
		url = (e.stacktrace.match( /\(\) in\s+(.*?\:\/\/\S+)/m ) || ["", ""])[1];
    } else if ( e.stack ) {
        url = (e.stack.match( /((http|file)\:\/{2,3}\S+\/\S+\.[a-z0-9]+)/i ) || ['',''])[1];
    }
}

alert(url);