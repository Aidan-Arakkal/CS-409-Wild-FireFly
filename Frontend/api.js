// Shared helpers for talking to the backend.
// Empty origin = same server (local dev). On GitHub Pages the workflow fills in the Render URL.
const apiOrigin = document.querySelector('meta[name=auth-api-origin]')?.content || '';

async function api(path, { method = 'GET', body, credentials = 'same-origin' } = {}) {
    if (!apiOrigin && location.hostname.endsWith('.github.io')) {
        throw new Error('The server has not been configured yet.');
    }
    const isForm = body instanceof FormData;
    const response = await fetch(apiOrigin + '/api' + path, {
        method,
        credentials,
        // FormData sets its own multipart Content-Type; don't override it.
        headers: body && !isForm ? { 'Content-Type': 'application/json' } : {},
        body: body && !isForm ? JSON.stringify(body) : body
    });
    if (response.status === 204) return null;
    if (!response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('The server is unavailable (it may be waking up). Try again shortly.');
    }
    const data = await response.json();
    if (!response.ok) {
        // Auth routes use { error }, sightings routes use { message }.
        const error = new Error(data.error || data.message || 'Request failed.');
        error.status = response.status;
        throw error;
    }
    return data;
}

// Who is signed in? Needs the session cookie, so it sends credentials.
// Returns { id, name, email } or null.
async function getCurrentUser() {
    try {
        const { user } = await api('/auth/me', { credentials: 'include' });
        return user;
    } catch (error) {
        if (error.status === 401) return null;
        throw error;
    }
}

// Downscale an image File in the browser before upload (proposal requirement).
// Resolves to a JPEG Blob that can go straight into FormData.
function downscaleImage(file, maxSize = 1600, quality = 0.85) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(img.src);
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process image.'))),
                'image/jpeg', quality);
        };
        img.onerror = () => reject(new Error('Could not read that image.'));
        img.src = URL.createObjectURL(file);
    });
}

// Gabe's sightings API (Backend/routes/sightings.js). Responses look like { message, data }.
// These routes allow any origin without cookies, so no credentials are sent.
const SightingsAPI = {
    // One user's sightings, newest first.
    list: (userId) => {
        const params = new URLSearchParams({
            where: JSON.stringify({ sightingUser: userId }),
            sort: JSON.stringify({ dateCreated: -1 })
        });
        return api('/sightings?' + params).then((res) => res.data);
    },

    // fields: { userId, species, description, placeName, latitude, longitude, imageFile }
    create: async (fields) => {
        const form = new FormData();
        form.append('sightingUser', fields.userId);
        form.append('species', fields.species);
        form.append('description', fields.description || '');
        form.append('placeName', fields.placeName || '');
        form.append('latitude', fields.latitude);
        form.append('longitude', fields.longitude);
        if (fields.imageFile) {
            form.append('image', await downscaleImage(fields.imageFile), 'sighting.jpg');
        }
        return api('/sightings', { method: 'POST', body: form }).then((res) => res.data);
    },

    remove: (id) => api('/sightings/' + id, { method: 'DELETE' })
};
