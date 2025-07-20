/* global fetch, document, io */
'use strict';

const colorPicker   = document.getElementById('colorPicker');
const mapContainer  = document.getElementById('mapContainer');

let state = {};                 
let ruinData = {};  // key: PathID -> { Level, Name, Coordinates, Buff }
const originalFills = {};       

const sessionKey = window.location.pathname.split('/')[1] || 'default';
const socket = io();  // Connect to server

socket.emit('join', sessionKey);  // Join room for this key

socket.on('update', ({ regionId, color }) => {
  const el = document.getElementById(regionId);
  if (el) {
    el.setAttribute('fill', color || originalFills[regionId] || 'transparent');
    if (color) {
      state[regionId] = color;
    } else {
      delete state[regionId];
    }
  }
});

async function loadState() {
  try {
    const res = await fetch(`/api/state/${sessionKey}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state = await res.json();
  } catch (err) {
    console.error('Failed to load state:', err);
    state = {};
  }
}

async function saveState() {
  try {
    await fetch(`/api/state/${sessionKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

function colorRegion(path, color) {
  const id = path.getAttribute('id');
  if (!id) return;

  path.setAttribute('fill', color);
  state[id] = color;
  saveState();
  socket.emit('update', { key: sessionKey, regionId: id, color });
}

function eraseRegion(path) {
  const id = path.getAttribute('id');
  if (!id) return;

  const orig = originalFills[id] ?? 'transparent';
  path.setAttribute('fill', orig);

  if (id in state) {
    delete state[id];
    saveState();
    socket.emit('update', { key: sessionKey, regionId: id, color: null });
  }
}

const defaultSwatches = [
  { name: 'red', value: '#d25040' },
  { name: 'orange', value: '#df6e34' },
  { name: 'orange-yellow', value: '#e09e50' },
  { name: 'yellow', value: '#dbb431' },
  { name: 'green', value: '#56de40' },
  { name: 'cyan', value: '#df9d4f' },
  { name: 'blue', value: '#5a66b2' },
  { name: 'purple', value: '#8944c1' }
];

function setupColorSwatches() {
  const colorPicker = document.getElementById('colorPicker');
  const defaultContainer = document.getElementById('defaultColors');
  const customContainer = document.getElementById('customColors');

  defaultSwatches.forEach(({ name, value }) => {
    const box = document.createElement('div');
    box.title = name;
    box.style.cssText = `
      width: 2.25em; height: 2.25em; background: ${value};
      border: 2px solid #888; cursor: pointer; box-sizing: border-box;
    `;
    box.addEventListener('click', () => {
      colorPicker.value = value;
    });
    defaultContainer.appendChild(box);
  });

  for (let i = 0; i < 8; i++) {
    const box = document.createElement('div');
    box.dataset.index = i;
    box.style.cssText = `
      width: 2.25em; height: 2.25em; background: transparent;
      border: 2px dashed #666; cursor: pointer; box-sizing: border-box;
    `;

    box.addEventListener('click', () => {
      const bg = box.style.backgroundColor;
      if (bg && bg !== 'transparent') {
        const rgb = getComputedStyle(box).backgroundColor;
        const match = rgb.match(/\d+/g);
        if (match && match.length === 3) {
          const hex = '#' + match.map(n => (+n).toString(16).padStart(2, '0')).join('');
          colorPicker.value = hex;
        }
      }
    });

    box.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const color = colorPicker.value;
      box.style.backgroundColor = color;
      box.style.borderStyle = 'solid';
    });

    customContainer.appendChild(box);
  }
}

async function initMap() {
  await loadState();
  try {
    const res = await fetch('ruins.json');
    const data = await res.json();
    for (const row of data) {
      ruinData[row.PathID] = row;
    }
  } catch (err) {
    console.error('Failed to load ruin data:', err);
  }


  const res = await fetch('map.svg');
  const svgText = await res.text();
  mapContainer.innerHTML = svgText;

  const svg = mapContainer.querySelector('svg');
  if (!svg.hasAttribute('viewBox')) {
    const width = svg.getAttribute('width') || 1000;
    const height = svg.getAttribute('height') || 1000;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  setupColorSwatches();

  svg.addEventListener('contextmenu', (e) => e.preventDefault());

  const paths = svg.querySelectorAll('path');
  paths.forEach((path, i) => {
    if (!path.id) path.id = `region-${i}`;
    originalFills[path.id] = path.getAttribute('fill') || 'transparent';

    if (state[path.id]) {
      path.setAttribute('fill', state[path.id]);
    }

    path.style.cursor = 'pointer';

    path.addEventListener('click', (e) => {
      if (e.button !== 0) return;
      const color = colorPicker.value;
      colorRegion(path, color);
    });

    path.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      eraseRegion(path);
    });

    path.addEventListener('mouseup', (e) => {
      if (e.button === 2) eraseRegion(path);
    });

    path.addEventListener('mouseenter', (e) => {
      const id = path.id;
      const info = ruinData[id];
      if (!info) return;

      const tooltip = document.getElementById('tooltip');
      tooltip.innerHTML = `
        <strong>${info.Name || ''}</strong><br/>
        Level: ${info.Level || ''}<br/>
        Coords: ${info.Coordinates || ''}<br/>
        ${info.Buff ? 'Buff: ' + info.Buff : ''}
      `;
      tooltip.style.display = 'block';
    });

    path.addEventListener('mousemove', (e) => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.left = (e.pageX + 12) + 'px';
      tooltip.style.top = (e.pageY + 12) + 'px';
    });

    path.addEventListener('mouseleave', () => {
      const tooltip = document.getElementById('tooltip');
      tooltip.style.display = 'none';
    });
  });
}

initMap();

