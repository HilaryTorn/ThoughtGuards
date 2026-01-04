/**
 * Build-time script to generate a manifest of all test case files
 * Run this before building to create a manifest.json that lists all available test cases
 * 
 * Usage: node scripts/generate-test-cases-manifest.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MOCK_DATA_DIR = path.join(__dirname, '../../mock_data');
const PUBLIC_MOCK_DATA_DIR = path.join(__dirname, '../public/mock_data');
const OUTPUT_FILE = path.join(__dirname, '../public/test-cases-manifest.json');

function findJsonFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      findJsonFiles(filePath, fileList);
    } else if (file.endsWith('.json')) {
      const relativePath = path.relative(MOCK_DATA_DIR, filePath).replace(/\\/g, '/');
      fileList.push(relativePath);
    }
  });
  
  return fileList;
}

function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      copyFile(srcPath, destPath);
    }
  }
}

function generateManifest() {
  console.log('Scanning mock_data directory...');
  
  if (!fs.existsSync(MOCK_DATA_DIR)) {
    console.warn(`Mock data directory not found: ${MOCK_DATA_DIR}`);
    return;
  }
  
  const jsonFiles = findJsonFiles(MOCK_DATA_DIR);
  console.log(`Found ${jsonFiles.length} JSON files`);
  
  // Copy mock_data to public/mock_data so it can be served
  console.log('Copying mock_data files to public/mock_data...');
  if (fs.existsSync(PUBLIC_MOCK_DATA_DIR)) {
    fs.rmSync(PUBLIC_MOCK_DATA_DIR, { recursive: true, force: true });
  }
  copyDirectory(MOCK_DATA_DIR, PUBLIC_MOCK_DATA_DIR);
  console.log('Files copied to public/mock_data');
  
  const manifest = {
    generated: new Date().toISOString(),
    totalFiles: jsonFiles.length,
    files: jsonFiles.map(file => ({
      path: file,
      url: `/mock_data/${file}`,
    })),
  };
  
  // Ensure public directory exists
  const publicDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));
  console.log(`Manifest written to: ${OUTPUT_FILE}`);
  console.log(`Total files: ${manifest.totalFiles}`);
  console.log(`Files are now available at /mock_data/...`);
}

generateManifest();

