const statusMessage = document.getElementById('status');
const guest = document.getElementById('guest');
const logout = document.getElementById('logout');
const login = document.getElementById('login');
const apiOrigin = document.querySelector('meta[name=auth-api-origin]').content;

function showUser(user) {
    guest.hidden = Boolean(user);
    logout.hidden = !user;
    statusMessage.textContent = user ? `Signed in as ${user.name} (${user.email}).` : 'Signed out.';
}

async function authRequest(action, fields) {
    const options = fields === undefined ? {} : {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields)
    };
    if (!apiOrigin && location.hostname.endsWith('.github.io')) {
        throw new Error('The sign-in server has not been configured yet.');
    }
    const response = await fetch(apiOrigin + '/api/auth/' + action, {
        ...options,
        credentials: 'include'
    });
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The sign-in server is unavailable. Try again shortly.');
    }
    if (action === 'me' && response.status === 401) return { user: null };
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data;
}

function bindForm(id, onSuccess) {
    const form = document.getElementById(id);
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const button = form.querySelector('button');
        button.disabled = true;
        try {
            const data = await authRequest(id, Object.fromEntries(new FormData(form)));
            form.reset();
            onSuccess(data.user);
        } catch (error) {
            statusMessage.textContent = error.message;
        } finally {
            button.disabled = false;
        }
    });
}

bindForm('register', (user) => {
    statusMessage.textContent = 'Account created. Sign in with your email and password.';
    login.elements.email.value = user.email;
    login.elements.password.focus();
});
bindForm('login', (user) => {
    window.location.assign('./profile.html');
});

logout.addEventListener('click', async () => {
    logout.disabled = true;
    try {
        await authRequest('logout', {});
        showUser(null);
    } catch (error) {
        statusMessage.textContent = error.message;
    } finally {
        logout.disabled = false;
    }
});

authRequest('me').then(({ user }) => showUser(user)).catch(() => {
    statusMessage.textContent = 'Could not check your sign-in status.';
});
