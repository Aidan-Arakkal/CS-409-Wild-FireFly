# Backend setup

1. Install Node.js 24 and run `npm install` from this directory.
2. Copy `.env.example` to `.env`. In Atlas, open Cluster0 → Connect → Drivers → Node.js. Use that URI for `MONGODB_URI` and substitute your Atlas database username and password. Percent-encode reserved characters in the username or password.
3. Give that Atlas database user read/write access to `cs409_final` and add the IP of the machine running the API to the Atlas IP access list.
4. Run `npm start` and open [the health endpoint](http://localhost:3000/api/health). A successful response includes `"status":"ok"` and `"database":"cs409_final"`.

The backend explicitly selects `cs409_final` and prepares the unique email index in `users` on startup. The user model is ready for signup and login routes. Those routes still need to hash and verify passwords and establish sessions. Keep `.env` out of Git and frontend code.
