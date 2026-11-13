# Backend setup

This backend handles authentication. Its MongoDB connection and health endpoint cover `cs409_final`, which stores users and sessions. A teammate owns the project’s second database and its integration.

1. Install Node.js 24 and run `npm install` from this directory.
2. Copy `.env.example` to `.env` if you haven't already. Set `MONGODB_URI` to the Atlas connection string for the authentication database.
3. Give that Atlas database user read/write access to `cs409_final` and add the IP of the machine running the API to the Atlas IP access list.
4. Run `npm start` and open [the app](http://localhost:3000/). [The health endpoint](http://localhost:3000/api/health) should report `"status":"ok"` and `"database":"cs409_final"`.

Create a test account with a password of at least 8 characters. Sign in with the same credentials, refresh to confirm the session persists, and sign out. In Atlas Data Explorer, verify that `cs409_final.users` contains the new account with a password hash. The backend stores expiring sessions in `cs409_final.sessions`.

Keep `.env` out of Git and frontend code. This is a development demo. Before exposing it publicly, add rate limits to registration and login and use HTTPS with `NODE_ENV=production`.
