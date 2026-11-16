const cards = Array.from(document.querySelectorAll('#memory-grid .card'));
const groupHeadings = Array.from(document.querySelectorAll('.group-heading'));
const mapPoints = document.querySelectorAll('.map-point');
const memoryGrid = document.getElementById('memory-grid');
const searchInput = document.getElementById('search');
const groupSelect = document.getElementById('group');
const mapSelect = document.getElementById('map-place');
const detailDialog = document.getElementById('detail');
let selectedCard = null;

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

    detailImage.src = cardImage.getAttribute('src');
    detailImage.alt = cardImage.alt;

    document.getElementById('detailtitle').textContent =
        getCardValue(card, 'species');

    document.getElementById('detail-meta').textContent =
        getCardValue(card, 'location') + ' · ' +
        getCardValue(card, 'date');

    document.getElementById('detail-notes').textContent =
        getCardValue(card, 'notes');

    detailDialog.showModal();
}

function closeMemory() {
    detailDialog.close();
}

function updateMap() {
    const option = mapSelect.options[mapSelect.selectedIndex];
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

for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    card.querySelector('.memory-button').addEventListener('click', function () {
        openMemory(card);
    });
}

searchInput.addEventListener('input', updateSightings);
groupSelect.addEventListener('change', updateSightings);
mapSelect.addEventListener('change', updateMap);
document.getElementById('clear-search').addEventListener('click', clearSearch);
document.getElementById('close-detail').addEventListener('click', closeMemory);
document.getElementById('show-on-map').addEventListener('click', showMemoryOnMap);
document.getElementById('journal-button').addEventListener('click', openJournal);

updateTotals();
updateSightings();
updateMap();
