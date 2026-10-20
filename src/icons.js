const paths={
  grind:'<path d="M5 3h14l-2 6H7zM8 9v4h8V9M6 13h12v8H6zM9 17h6M12 3v6"/>',
  coffee:'<path d="M4 8h12v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM16 9h2a3 3 0 0 1 0 6h-2M3 23h16M7 2v2m5-2v2"/>',
  steam:'<path d="M6 20c-5-5 5-6 0-12M12 20c-5-7 5-8 0-16M18 20c-5-5 5-6 0-12"/>',
  pitcher:'<path d="m5 5 1 14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V4H9L5 2v3ZM18 7h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M8 8h7"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  drop:'<path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12ZM9 16a3 3 0 0 0 3 3"/>',
  reset:'<path d="M3 10a9 9 0 1 1 1 8M3 4v6h6"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3v.1"/>',
  play:'<path d="m8 4 12 8-12 8z"/>',
  chart:'<path d="M4 3v17h17M7 14l4-4 4 2 6-7"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  sound:'<path d="m4 9 4 0 5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  cube:'<path d="m12 3 9 5v9l-9 5-9-5V8zM3 8l9 5 9-5m-9 5v9m-5-17 10 5"/>',
  stop:'<rect x="5" y="5" width="14" height="14" rx="2"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>'
};
export function mountIcons(){for(const node of document.querySelectorAll('[data-icon]'))node.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[node.dataset.icon]||paths.target}</svg>`;}
