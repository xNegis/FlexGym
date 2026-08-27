import { Capacitor, registerPlugin } from "@capacitor/core";
import {
  RestCueDeliveryController,
  type RestCueDeliveryAdapter,
  type RestCueDeliveryTarget,
} from "./restCueDelivery";

interface NativeRestCueScheduleResult {
  scheduled: boolean;
}

interface NativeRestCuePlugin {
  schedule(options: {
    identifier: string;
    delayMs: number;
    title: string;
    body: string;
  }): Promise<NativeRestCueScheduleResult>;
  cancel(options: { identifier: string }): Promise<void>;
  play(options: { identifier: string }): Promise<void>;
}

const NativeRestCue = registerPlugin<NativeRestCuePlugin>("NativeRestCue");

class IosRestCueDeliveryAdapter implements RestCueDeliveryAdapter {
  async schedule(target: RestCueDeliveryTarget): Promise<boolean> {
    const result = await NativeRestCue.schedule({
      identifier: target.identifier,
      delayMs: target.delayMs,
      title: "Rest complete",
      body: "Your next set is ready.",
    });
    return result.scheduled;
  }

  async cancel(identifier: string): Promise<void> {
    await NativeRestCue.cancel({ identifier });
  }

  async play(identifier: string): Promise<void> {
    await NativeRestCue.play({ identifier });
  }
}

export function createNativeRestCueDeliveryController(): RestCueDeliveryController | null {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return null;
  return new RestCueDeliveryController(new IosRestCueDeliveryAdapter());
}
