import * as fs from 'fs';
import * as path from 'path';

const appsFile = path.resolve(process.cwd(), 'runtime-data', 'apps.json');

let appsData: Record<string, { key: string }> = {};

try {
  const raw = fs.readFileSync(appsFile, 'utf8');
  appsData = JSON.parse(raw);
  console.log('apps loaded:', appsData);
} catch (error) {
  console.error('Failed to read apps.json:', error);
}

export const APPS = appsData;

export function updateAppKey(appName: string, newKey: string) {
  if (!appsData[appName]) throw new Error('App not found');

  appsData[appName].key = newKey;

  try {
    fs.writeFileSync(appsFile, JSON.stringify(appsData, null, 2), 'utf8');
    console.log('apps.json updated successfully');
  } catch (err) {
    console.error('Failed to write apps.json:', err);
  }
}
