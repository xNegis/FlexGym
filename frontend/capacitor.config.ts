import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.formcadence",
  appName: "FormCadence",
  webDir: "dist",
  loggingBehavior: "debug",
  ios: {
    preferredContentMode: "mobile",
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
