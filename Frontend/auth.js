const statusMessage = document.getElementById('status');
const guest = document.getElementById('guest');
const logout = document.getElementById('logout');
const login = document.getElementById('login');

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
    const response = await fetch('/api/auth/' + action, options);
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
bindForm('login', showUser);

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
