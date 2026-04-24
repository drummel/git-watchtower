import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  integrations: [
    starlight({
      title: 'Git Watchtower',
      description: 'Terminal-based Git branch monitor with activity sparklines. Built for AI coding agents.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/drummel/git-watchtower' },
        { icon: 'npm', label: 'npm', href: 'https://www.npmjs.com/package/git-watchtower' },
        { icon: 'x.com', label: 'X', href: 'https://x.com/AdrianDrummond' },
      ],
      components: {
        SiteTitle: './src/components/SiteTitle.astro',
      },
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Quick Start', link: '/guides/quick-start/' },
            { label: 'Configuration', link: '/guides/configuration/' },
          ],
        },
        {
          label: 'Features',
          items: [
            { label: 'Server Modes', link: '/guides/server-modes/' },
            { label: 'Web Dashboard', link: '/guides/web-dashboard/' },
            { label: 'Keyboard Controls', link: '/guides/keyboard-controls/' },
          ],
        },
        {
          label: 'Help',
          items: [
            { label: 'Troubleshooting', link: '/guides/troubleshooting/' },
          ],
        },
      ],
    }),
  ],
});
