import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cocoloco.pedidos',
  appName: 'Coco Loco Pedidos',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  }
};

export default config;
