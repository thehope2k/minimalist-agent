import { contextBridge } from 'electron';
import { homedir } from 'node:os';
import type { AppApi } from '../shared/electron-api';
import {
  createAssetsApi,
  createChatApi,
  createConfigurationApi,
  createStorageApi,
  createSystemApi,
  createToolsApi,
} from './api';

const api: AppApi = {
  ...createSystemApi(),
  ...createChatApi(),
  ...createConfigurationApi(),
  ...createStorageApi(),
  ...createAssetsApi(),
  ...createToolsApi(),
};

contextBridge.exposeInMainWorld('api', api);
contextBridge.exposeInMainWorld('env', { homedir: homedir() });
