/**
 * Scroll only when Nightjar explicitly changes the current page.
 *
 * Do not install global click listeners or reset scrolling inside dialogs,
 * tabs, readers, or other independently scrollable UI. Those surfaces must
 * remain under the user's control.
 */
export const scrollNightjarToTop = () => {
  const scrollToTop = () => {
    const root = document.scrollingElement ?? document.documentElement;
    root.scrollTop = 0;
    root.scrollLeft = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  };
  scrollToTop();
  // The view swap is scheduled by React; a single frame accounts for the new content.
  window.requestAnimationFrame(scrollToTop);
};
