export type NativeCaptureDetail = {
  source?: string;
  active?: boolean;
  platform?: 'android' | 'ios' | string;
  osVersion?: string;
};

type NightjarProtectionBridge = {
  version: 1;
  screenshot: (detail?: NativeCaptureDetail) => void;
  screenCapture: (detail?: NativeCaptureDetail) => void;
};

declare global {
  interface Window {
    NightjarProtectionBridge?: NightjarProtectionBridge;
  }
}

const dispatch = (name: string, detail: NativeCaptureDetail = {}) => {
  window.dispatchEvent(new CustomEvent(name, {
    detail: {
      ...detail,
      source: detail.source ?? 'native_shell',
    },
  }));
};

export const installNativeProtectionBridge = () => {
  if (typeof window === 'undefined') return () => {};

  const previous = window.NightjarProtectionBridge;
  const bridge: NightjarProtectionBridge = {
    version: 1,
    screenshot(detail = {}) {
      dispatch('nightjar:native-screenshot', detail);
    },
    screenCapture(detail = {}) {
      dispatch('nightjar:native-screen-capture', detail);
    },
  };

  window.NightjarProtectionBridge = bridge;

  return () => {
    if (window.NightjarProtectionBridge === bridge) {
      if (previous) window.NightjarProtectionBridge = previous;
      else delete window.NightjarProtectionBridge;
    }
  };
};
