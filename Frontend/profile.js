// Data now comes from the backend (SightingsAPI in api.js, Gabe's /api/sightings).
// The page is rendered from the sightings array into the same markup the static mock used,
// then the original filter / group / map / detail logic runs on it unchanged.

// Fallback shown if the server can't be reached (e.g. Render free tier waking up).
const MOCK_SIGHTINGS = [
    { _id: 'mock-1', species: 'Giraffe', seenAt: '2026-11-09', image: './images/africa-safari-giraffes.jpg.webp',
      location: { name: 'Masai Mara National Reserve, Kenya', lat: -1.49, lng: 35.14 },
      notes: 'Tall browsing mammal with a patterned coat, feeding on leaves high in trees.' },
    { _id: 'mock-2', species: 'Cheetah', seenAt: '2026-11-06', image: './images/african-safari-cheetah-trcuk.jpg.webp',
      location: { name: 'Masai Mara National Reserve, Kenya', lat: -1.49, lng: 35.14 },
      notes: 'Slender, spotted predator adapted for fast chases across open grassland.' },
    { _id: 'mock-3', species: 'Rhinoceros', seenAt: '2026-10-18', image: './images/africa-safari-rhinos.jpg.webp',
      location: { name: 'Kruger National Park, South Africa', lat: -24.0, lng: 31.5 },
      notes: 'Large horned herbivore with thick skin and strong senses of smell and hearing.' },
    { _id: 'mock-4', species: 'Zebra', seenAt: '2026-10-12', image: './images/ngorongoro_conservation-zebras.jpg.webp',
      location: { name: 'Serengeti National Park, Tanzania', lat: -2.33, lng: 34.83 },
      notes: 'Striped grazing animal that lives in herds; each individual has a distinctive stripe pattern.' },
    { _id: 'mock-5', species: 'Nile Crocodile', seenAt: '2026-10-04', image: './images/crocodile-945308_1280.jpg.webp',
      location: { name: 'Kruger National Park, South Africa', lat: -24.0, lng: 31.5 },
      notes: 'Aquatic ambush predator often seen resting on riverbanks or waiting near the water.' },
    { _id: 'mock-6', species: 'Gazelle', seenAt: '2026-09-25', image: './images/gazelle_safari_antelope__-1060x706.jpg.webp',
      location: { name: 'Serengeti National Park, Tanzania', lat: -2.33, lng: 34.83 },
      notes: 'Swift, slender antelope that grazes in open country and escapes predators through agility.' }
];

let sightings = [];
let usingMock = false;
let currentUser = null;

// Convert a sighting from the backend's format to the shape this page draws.
// Backend: { _id, species, description, dateCreated, image,
//            location: { coordinates: [lng, lat], placeName } }
function fromApi(s) {
    const [lng, lat] = s.location?.coordinates || [];
    return {
        _id: s._id,
        species: s.species,
        notes: s.description,
        seenAt: s.dateCreated,
        image: s.image,
        location: { name: s.location?.placeName || undefined, lat, lng }
    };
}

// These were consts captured once at load; now re-queried after each render.
let cards = [];
let groupHeadings = [];
let mapPoints = [];
const memoryGrid = document.getElementById('memory-grid');
const searchInput = document.getElementById('search');
const groupSelect = document.getElementById('group');
const mapSelect = document.getElementById('map-place');
const detailDialog = document.getElementById('detail');
let selectedCard = null;

// ---------- Rendering from data ----------

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'dataset') Object.assign(node.dataset, value);
        else if (key in node) node[key] = value;
        else node.setAttribute(key, value);
    }
    node.append(...children);
    return node;
}

const locationName = (s) => s.location?.name || 'Unknown location';
const dateString = (s) => new Date(s.seenAt).toISOString().slice(0, 10);
const unique = (values) => [...new Set(values)];

function renderCard(s) {
    const art = el('span', { className: 'art' });
    if (s.image) {
        const img = el('img', { src: s.image, alt: s.species, loading: 'lazy' });
        img.addEventListener('error', () => { art.textContent = '🌿'; }); // broken/missing image link
        art.append(img);
    } else {
        art.textContent = '🌿';
    }

    const button = el('button', {
        type: 'button',
        className: 'memory-button',
        'aria-label': `Open ${s.species} sighting at ${locationName(s)}`
    },
        art,
        el('span', { className: 'body' },
            el('span', { className: 'tag' }, locationName(s)),
            el('span', { className: 'card-title' }, s.species),
            el('small', {}, dateString(s)),
            el('span', { className: 'card-notes', hidden: true }, s.notes || ''),
            el('strong', {}, 'View Memory →')
        )
    );
    const card = el('article', { className: 'card', id: 'memory-' + s._id, dataset: { id: s._id } }, button);
    button.addEventListener('click', () => openMemory(card));
    return card;
}

function renderHeadings(type, values) {
    return values.map((value) => el('h3', {
        className: 'group-heading', hidden: true, dataset: { groupType: type, groupValue: value }
    }, value));
}

function renderMapControls() {
    const previous = mapSelect.value;
    const places = new Map(); // name -> {lat, lng}
    for (const s of sightings) {
        if (s.location?.lat != null && !places.has(locationName(s))) places.set(locationName(s), s.location);
    }
    mapSelect.replaceChildren(...[...places].map(([name, loc]) =>
        el('option', { value: name, dataset: { latitude: loc.lat, longitude: loc.lng } }, name)));
    if (places.has(previous)) mapSelect.value = previous;

    const pointsContainer = document.getElementById('map-points');
    pointsContainer.replaceChildren(...sightings.map((s) =>
        el('div', { className: 'map-point', dataset: { location: locationName(s) } },
            el('strong', {}, s.species),
            el('span', {}, `${dateString(s)} · ${locationName(s)}`))));
}

function render() {
    memoryGrid.replaceChildren(
        ...renderHeadings('location', unique(sightings.map(locationName))),
        ...renderHeadings('species', unique(sightings.map((s) => s.species))),
        ...sightings.map(renderCard)
    );
    renderMapControls();

    cards = Array.from(document.querySelectorAll('#memory-grid .card'));
    groupHeadings = Array.from(document.querySelectorAll('.group-heading'));
    mapPoints = document.querySelectorAll('.map-point');

    updateTotals();
    updateSightings();
    updateMap();
}

async function loadSightings() {
    try {
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.assign('./index.html'); // not signed in
            return;
        }
        sightings = (await SightingsAPI.list(currentUser.id)).map(fromApi);
        usingMock = false;
    } catch (error) {
        sightings = MOCK_SIGHTINGS;
        usingMock = true;
    }
    render();
    if (usingMock) {
        document.getElementById('results-count').textContent += ' (demo data — server unavailable)';
    }
}

// ---------- Original page logic (unchanged except where noted) ----------

function getCardValue(card, field) {
    if (field === 'species') {
        return card.querySelector('.card-title').textContent.trim();
    }
    if (field === 'location') {
        return card.querySelector('.tag').textContent.trim();
    }
    if (field === 'date') {
        return card.querySelector('small').textContent.trim();
    }
    return card.querySelector('.card-notes').textContent.trim();
}

function updateSightings() {
    const query = searchInput.value.trim().toLowerCase();
    const view = groupSelect.value;
    const matches = [];

    for (let i = 0; i < groupHeadings.length; i++) {
        groupHeadings[i].hidden = true;
    }

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const text = getCardValue(card, 'species') + ' ' +
            getCardValue(card, 'location') + ' ' + getCardValue(card, 'notes');
        const isMatch = text.toLowerCase().includes(query);
        card.hidden = !isMatch;
        if (isMatch) {
            matches.push(card);
        }
    }

    let title = 'All Sightings';
    if (view === 'newest') {
        title = 'Newest Sightings';
        matches.sort(function (first, second) {
            const firstDate = getCardValue(first, 'date');
            const secondDate = getCardValue(second, 'date');
            if (firstDate > secondDate) {
                return -1;
            }
            if (firstDate < secondDate) {
                return 1;
            }
            return 0;
        });
    } else if (view === 'location') {
        title = 'Sightings by Location';
    } else if (view === 'species') {
        title = 'Sightings by Species';
    }

    document.getElementById('results-heading').textContent = title;
    document.getElementById('results-count').textContent = matches.length + ' of ' + cards.length + ' sightings shown';
    document.getElementById('empty-state').hidden = matches.length !== 0;

    if (view === 'location' || view === 'species') {
        for (let i = 0; i < groupHeadings.length; i++) {
            const heading = groupHeadings[i];
            if (heading.dataset.groupType !== view) {
                continue;
            }
            let headingAdded = false;
            for (let j = 0; j < matches.length; j++) {
                const card = matches[j];
                if (getCardValue(card, view) === heading.dataset.groupValue) {
                    if (!headingAdded) {
                        heading.hidden = false;
                        memoryGrid.appendChild(heading);
                        headingAdded = true;
                    }
                    memoryGrid.appendChild(card);
                }
            }
        }
    } else {
        for (let i = 0; i < matches.length; i++) {
            memoryGrid.appendChild(matches[i]);
        }
    }
}

function clearSearch() {
    searchInput.value = '';
    updateSightings();
    searchInput.focus();
}

function openMemory(card) {
    selectedCard = card;

    const cardImage = card.querySelector('.art img');
    const detailImage = document.getElementById('detail-image');

    // Changed: sightings without a photo have no <img>.
    detailImage.hidden = !cardImage;
    if (cardImage) {
        detailImage.src = cardImage.getAttribute('src');
        detailImage.alt = cardImage.alt;
    }

    document.getElementById('detailtitle').textContent =
        getCardValue(card, 'species');

    document.getElementById('detail-meta').textContent =
        getCardValue(card, 'location') + ' · ' +
        getCardValue(card, 'date');

    document.getElementById('detail-notes').textContent =
        getCardValue(card, 'notes');

    // Changed: only offer the map if this sighting has coordinates.
    document.getElementById('show-on-map').hidden =
        !Array.from(mapSelect.options).some((o) => o.value === getCardValue(card, 'location'));
    document.getElementById('delete-sighting').hidden = usingMock;

    detailDialog.showModal();
}

function closeMemory() {
    detailDialog.close();
}

function updateMap() {
    const option = mapSelect.options[mapSelect.selectedIndex];
    // Changed: handle "no sightings with coordinates yet".
    if (!option) {
        document.getElementById('sighting-map').removeAttribute('src');
        document.getElementById('map-summary').textContent = 'No sighting locations yet.';
        return;
    }
    const coordinates = option.dataset.latitude + ',' + option.dataset.longitude;
    document.getElementById('sighting-map').src = 'https://www.google.com/maps?q=' +
        encodeURIComponent(coordinates) + '&z=14&output=embed';

    let count = 0;
    for (let i = 0; i < mapPoints.length; i++) {
        const point = mapPoints[i];
        point.hidden = point.dataset.location !== mapSelect.value;
        if (!point.hidden) {
            count++;
        }
    }
    document.getElementById('map-summary').textContent = mapSelect.value + ' · ' + count + ' sightings';
}

function showMemoryOnMap() {
    if (selectedCard === null) {
        return;
    }
    mapSelect.value = getCardValue(selectedCard, 'location');
    updateMap();
    closeMemory();
    const heading = document.getElementById('map-title');
    heading.tabIndex = -1;
    heading.focus();
    heading.scrollIntoView({ behavior: 'smooth' });
}

function updateTotals() {
    const species = [];
    const locations = [];
    for (let i = 0; i < cards.length; i++) {
        const speciesName = getCardValue(cards[i], 'species');
        const locationName = getCardValue(cards[i], 'location');
        if (speciesName !== 'Unknown species' && species.indexOf(speciesName) === -1) {
            species.push(speciesName);
        }
        if (locations.indexOf(locationName) === -1) {
            locations.push(locationName);
        }
    }
    document.getElementById('total-sightings').textContent = cards.length;
    document.getElementById('total-species').textContent = species.length;
    document.getElementById('total-locations').textContent = locations.length;
}

function openJournal() {
    document.getElementById('journal-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---------- New: add / delete through the API ----------

const addDialog = document.getElementById('add-dialog');
const addForm = document.getElementById('add-form');
const addStatus = document.getElementById('add-status');

function openAdd() {
    if (usingMock) {
        alert('The server is unavailable, so new sightings cannot be saved right now.');
        return;
    }
    addForm.reset();
    addStatus.textContent = '';
    addDialog.showModal();
}

addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = addForm.querySelector('[type=submit]');
    submit.disabled = true;
    addStatus.textContent = 'Saving…';
    try {
        const fields = new FormData(addForm);
        const photo = fields.get('photo');
        const created = await SightingsAPI.create({
            userId: currentUser.id,
            species: fields.get('species'),
            description: fields.get('notes'),
            placeName: fields.get('locationName'),
            latitude: fields.get('lat'),
            longitude: fields.get('lng'),
            imageFile: photo && photo.size ? photo : null
        });
        sightings = [fromApi(created), ...sightings];
        render();
        addDialog.close();
    } catch (error) {
        addStatus.textContent = error.message;
    } finally {
        submit.disabled = false;
    }
});

document.getElementById('use-location').addEventListener('click', () => {
    navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
            addForm.elements.lat.value = coords.latitude.toFixed(5);
            addForm.elements.lng.value = coords.longitude.toFixed(5);
        },
        () => { addStatus.textContent = 'Could not get your location.'; }
    );
});

document.getElementById('delete-sighting').addEventListener('click', async () => {
    if (!selectedCard || !confirm('Delete this sighting?')) return;
    try {
        await SightingsAPI.remove(selectedCard.dataset.id);
        sightings = sightings.filter((s) => s._id !== selectedCard.dataset.id);
        closeMemory();
        render();
    } catch (error) {
        alert(error.message);
    }
});

document.querySelectorAll('.open-add').forEach((button) => button.addEventListener('click', openAdd));
document.getElementById('cancel-add').addEventListener('click', () => addDialog.close());

// ---------- Original listeners ----------

searchInput.addEventListener('input', updateSightings);
groupSelect.addEventListener('change', updateSightings);
mapSelect.addEventListener('change', updateMap);
document.getElementById('clear-search').addEventListener('click', clearSearch);
document.getElementById('close-detail').addEventListener('click', closeMemory);
document.getElementById('show-on-map').addEventListener('click', showMemoryOnMap);
document.getElementById('journal-button').addEventListener('click', openJournal);

loadSightings();
