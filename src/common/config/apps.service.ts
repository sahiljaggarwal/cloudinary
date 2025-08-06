import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AppsService {
  private readonly appsFile = path.resolve(
    process.cwd(),
    'runtime-data',
    'apps.json',
  );
  private appsData: Record<string, { key: string }> = {};

  constructor() {
    this.loadApps();
  }

  private loadApps() {
    try {
      const raw = fs.readFileSync(this.appsFile, 'utf8');
      this.appsData = JSON.parse(raw);
      console.log('apps loaded:', this.appsData);
    } catch (error) {
      console.error('Failed to read apps.json:', error);
    }
  }

  getApps() {
    return this.appsData;
  }

  findAppNameByKey(apiKey: string): string | undefined {
    return Object.keys(this.appsData).find(
      (name) => this.appsData[name].key === apiKey,
    );
  }

  updateAppKey(appName: string, newKey: string) {
    if (!this.appsData[appName]) {
      throw new Error('App not found');
    }

    this.appsData[appName].key = newKey;

    try {
      fs.writeFileSync(
        this.appsFile,
        JSON.stringify(this.appsData, null, 2),
        'utf8',
      );
      console.log('apps.json updated successfully');
    } catch (err) {
      console.error('Failed to write apps.json:', err);
    }
  }
}
