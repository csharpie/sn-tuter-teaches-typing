import { navLayoutContext } from '@servicenow/aiux/aiux-components-nav';
import { i18n } from '@servicenow/aiux/aiux-services';
import AppTheme from './theme.js';
import productName from './utils/product-name.js';

// Side navigation (APPLICATION_SPEC B3): Home, then the game's pages grouped
// under its product name. `gauge` is not in the AIUX icon set, so Speed test
// uses the nearest match, `dashboard-dial`.
export default {
  appTheme: AppTheme,
  applicationLayout: 'aiux-nav-layout',

  setup(ctx) {
    const items = [
      {
        icon: 'home',
        title: i18n.getMessage('Home'),
        action: { type: 'navigate', path: '/home' },
      },
      {
        icon: 'keyboard',
        title: productName(),
        children: [
          {
            icon: 'book-open',
            title: i18n.getMessage('Lessons'),
            action: { type: 'navigate', path: '/lessons' },
          },
          {
            icon: 'dashboard-dial',
            title: i18n.getMessage('Speed test'),
            action: { type: 'navigate', path: '/speed-test' },
          },
          {
            icon: 'pencil',
            title: i18n.getMessage('Custom lessons'),
            action: { type: 'navigate', path: '/custom' },
          },
          {
            icon: 'history',
            title: i18n.getMessage('History'),
            action: { type: 'navigate', path: '/history' },
          },
        ],
      },
    ];

    const activeRoute = ctx.app?.routes?.find((r) => r.active);
    const markActive = (item) => ({
      ...item,
      ...(item.action?.path === activeRoute?.route && { active: true }),
      ...(item.children && { children: item.children.map(markActive) }),
    });
    const itemsWithActive = items.map(markActive);

    const current = navLayoutContext.get();
    navLayoutContext.set({
      ...current,
      appTitle: productName(),
      // The content-toolbar label shows `pageTitle` ahead of the active nav
      // item's title. `header` keeps the toolbar on the grouped (L2) pages,
      // which hide it otherwise. Both are the same on every route, so
      // navigate() needn't re-resolve them.
      headerConfig: {
        header: true,
        pageTitle: productName(),
      },
      features: {
        menus: false,
        logo: true,
        userSession: false,
        notifications: false,
        themeToggle: false,
        densityPicker: false,
        unifiedExperience: false,
        profile: true,
        helpPanel: true,
      },
      items: itemsWithActive,
      defaultLogoFull: 'servicenow',
      defaultLogoIcon: 'servicenow',
    });
  },

  teardown() {
    navLayoutContext.set({
      items: [],
      defaultLogoFull: null,
      defaultLogoIcon: null,
    });
  },
};
