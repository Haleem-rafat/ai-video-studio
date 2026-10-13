#!/bin/bash
# Double-click in Finder to start AI Video Studio and open it in the browser.
# Close this window to stop the studio (and Bonsai, if the studio started it).
cd "$(dirname "$0")" || exit 1
npm start
