# Security policy

Please do not report security problems in public issues.

Report them privately through GitHub: open the repository's **Security** tab
and choose **Report a vulnerability**. Include the demo affected, what you
found, and how to reproduce it. We will acknowledge the report and keep you
informed while we fix it.

The demos are static, client-side apps. The only server code is the small
Worker in `shared/worker`, which proxies Growther.si's public release
information. Reports about the demos' sites (headers, CSP, the Worker) and about
the code in this repository are in scope. Growther.si C5 itself is not part of
this repository; report issues with it through <https://growther.si>.
