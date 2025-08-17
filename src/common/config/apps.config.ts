import * as path from 'path';
import * as fs from 'fs';

// Absolute path to JSON file
// const appsFile = path.resolve(__dirname, 'apps.json');
// const appsFile = path.resolve(__dirname, '..', '..', 'assets', 'apps.json');
let appsData: Record<string, { key: string }> = {};
try {
  // const appsFile = path.resolve(__dirname, '..', '..', 'assets', 'apps.json');
  const appsFile = path.resolve(process.cwd(), 'assets/apps.json');
  console.log();
  // const appsFile = path.resolve(process.cwd(), 'src/common/config/apps.json'); // <-- FIXED
  console.log('appsFile ', appsFile);

  console.log('appsdata ', appsData);

  const raw = fs.readFileSync(appsFile, 'utf8');
  console.log('raw ', raw);
  appsData = JSON.parse(raw);
  console.log('appsDate ', appsData);
} catch (error) {
  console.error('Failed to load apps.json:', error);
}

// Export the apps data
export const APPS = appsData;
