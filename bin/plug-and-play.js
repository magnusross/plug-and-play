#!/usr/bin/env node

const path = require('path');
const openModule = require('open');
const open = openModule.default || openModule;

// Start the server
require('../server/index.js');

// Give the server a tiny bit of time to bind to the port before opening the browser
setTimeout(() => {
  const url = 'http://localhost:4000';
  console.log(`\nLaunch successful! Opening ${url} in your browser...\n`);
  open(url);
}, 500);
