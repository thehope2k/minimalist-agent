import { createContext, useContext } from 'react';

export interface BrowserPanelControls {
  open: boolean;
  toggle: () => void;
}

const BrowserPanelContext = createContext<BrowserPanelControls>({
  open: false,
  toggle: () => {},
});

/** Lets the chat header and pill reach the side panel without prop drilling. */
export const BrowserPanelProvider = BrowserPanelContext.Provider;

export function useBrowserPanel(): BrowserPanelControls {
  return useContext(BrowserPanelContext);
}
