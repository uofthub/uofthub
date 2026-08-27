/**
 * Navigation model — mirrors the `pages` array in uoftindex.ca's App.vue.
 * Section 0 doubles as the top nav on the landing page; every section shows up
 * in the sidebar, the mobile drawer, and the footer.
 */
export type NavItem = {
  page: string
  icon: string
  link: string
  /** 1 = react-router link, 0 = opens in a new tab */
  internal: 0 | 1
  new?: boolean
  beta?: boolean
}

export type NavSection = {
  heading: string
  icon: string
  options: NavItem[]
}

export const GITHUB_URL = 'https://github.com/renfrrd-ai/uofthub'
export const CONTACT_EMAIL = 'uofthub@utoronto.ca'

export const navSections: NavSection[] = [
  {
    heading: '',
    icon: '',
    options: [
      { page: 'Projects', icon: 'mdi-view-grid-outline', link: '/projects', internal: 1 },
      { page: 'Discover', icon: 'mdi-creation', link: '/discover', internal: 1, beta: true },
      { page: 'Clubs & Labs', icon: 'mdi-account-group-outline', link: '/orgs', internal: 1 },
      { page: 'Share', icon: 'mdi-plus-box-outline', link: '/projects/new', internal: 1, new: true },
    ],
  },
  {
    heading: 'Community',
    icon: 'mdi-home-city-outline',
    options: [
      { page: 'About', icon: 'mdi-information-outline', link: '/about', internal: 1 },
      { page: 'Feedback & Report', icon: 'mdi-forum-outline', link: `${GITHUB_URL}/issues`, internal: 0 },
    ],
  },
  {
    heading: 'Resources',
    icon: 'mdi-package-variant',
    options: [
      { page: 'Source Code', icon: 'mdi-github', link: GITHUB_URL, internal: 0 },
      { page: 'Read the Docs', icon: 'mdi-file-document-outline', link: `${GITHUB_URL}#readme`, internal: 0 },
    ],
  },
]

/** Routes rendered without the app bar / sidebar chrome. */
export const BARE_ROUTES = ['/session']

/** Routes that use the landing-page chrome (centred nav, tall footer). */
export const LANDING_ROUTES = ['/']
