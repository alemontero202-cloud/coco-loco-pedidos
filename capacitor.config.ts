import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.cocoloco.pedidos',
  appName: 'Coco Loco Pedidos',
  webDir: '.',
  server: {
    androidScheme: 'https'
  }
};

export default config;
