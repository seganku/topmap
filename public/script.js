
function hexToHSL(hex) {
  let r = parseInt(hex.slice(0, 2), 16) / 255;
  let g = parseInt(hex.slice(2, 4), 16) / 255;
  let b = parseInt(hex.slice(4, 6), 16) / 255;

  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0;
  } else {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)); break;
      case g: h = ((b - r) / d + 2); break;
      case b: h = ((r - g) / d + 4); break;
    }
    h *= 60;
  }

  return { h, s, l };
}

function hslToHex(h, s, l) {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));

  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs((h / 60) % 2 - 1));
  let m = l - c / 2;

  let r = 0, g = 0, b = 0;
  if (h < 60)      { r = c; g = x; b = 0; }
  else if (h < 120){ r = x; g = c; b = 0; }
  else if (h < 180){ r = 0; g = c; b = x; }
  else if (h < 240){ r = 0; g = x; b = c; }
  else if (h < 300){ r = x; g = 0; b = c; }
  else             { r = c; g = 0; b = x; }

  let toHex = n => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  return toHex(r) + toHex(g) + toHex(b);
}

function generateHighlight(mainHex) {
  mainHex = mainHex.replace(/^#/, '');
  let { h, s, l } = hexToHSL(mainHex);
  h = (h + 10) % 360;
  s = s * 0.8;
  l = Math.min(1, l * 1.2);
  //return '#' + hslToHex(h, s, l);
  return '#' + mainHex;
}


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
  console.log("Update event received for ", regionId);
  const el = document.getElementById(regionId);
  if (el) {
    el.setAttribute('fill', color || originalFills[regionId] || 'transparent');
    if (color) {
      const highlight = generateHighlight(color);
      console.log("Color:", color, "Highlight:", highlight);
      el.setAttribute('stroke', highlight);
      el.setAttribute('stroke-width', '15');
      el.setAttribute('stroke-linejoin', 'round');
      el.setAttribute('vector-effect', 'non-scaling-stroke');
    } else {
      el.removeAttribute('stroke');
      el.removeAttribute('stroke-width');
      el.removeAttribute('vector-effect');
    }
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

  const svg = document.querySelector('svg');
  const defs = svg.querySelector('defs') || svg.insertBefore(document.createElementNS("http://www.w3.org/2000/svg", "defs"), svg.firstChild);
  const gradId = `grad-${id}`;
  let grad = document.getElementById(gradId);
  if (grad) grad.remove();

  const highlight = generateHighlight(color);
  console.log("ColorRegion ", id, " Color:", color, "Highlight:", highlight);
  grad = document.createElementNS("http://www.w3.org/2000/svg", "radialGradient");
  grad.setAttribute("id", gradId);
  grad.setAttribute("gradientUnits", "userSpaceOnUse");
  grad.setAttribute("cx", "0");
  grad.setAttribute("cy", "0");
  grad.setAttribute("r", "150");
  grad.innerHTML = `
    <stop offset="0%" stop-color="${color}" />
    <stop offset="100%" stop-color="${highlight}" />
  `;
  defs.appendChild(grad);

  path.setAttribute("fill", `url(#${gradId})`);

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

fetch('ruins.json')
  .then(res => res.json())
  .then(ruins => {
    const svg = document.querySelector('#mapContainer svg');
    if (!svg) {
      console.warn("SVG not found in #mapContainer");
      return;
    }

    //ruins.forEach(({ CentroidX, CentroidY }) => {
    //  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    //  circle.setAttribute('cx', CentroidX);
    //  circle.setAttribute('cy', CentroidY);
    //  circle.setAttribute('r', 7.5);
    //  circle.setAttribute('fill', 'red');
    //  circle.setAttribute('stroke', 'black');
    //  circle.setAttribute('stroke-width', '1');
    //  svg.appendChild(circle);
    //});
  });



}

initMap();
