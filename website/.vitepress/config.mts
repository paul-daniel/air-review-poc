import { defineConfig, type DefaultTheme } from "vitepress";

/**
 * The site is served from GitHub Pages under the repository path
 * (https://<owner>.github.io/air-review/). Change this one constant if the
 * site moves to a custom domain ("/") or to another repository name.
 */
const BASE = "/air-review/";

const enNav: DefaultTheme.NavItem[] = [
  { text: "Get started", link: "/guide/getting-started" },
  { text: "Integrations", link: "/integrations/microsoft-foundry" },
  { text: "Reference", link: "/reference/commands" },
  { text: "Concepts", link: "/concepts/how-it-works" },
  { text: "Troubleshooting", link: "/troubleshooting" },
];

const enSidebar: DefaultTheme.Sidebar = [
  {
    text: "Tutorial",
    items: [{ text: "Getting started", link: "/guide/getting-started" }],
  },
  {
    text: "Integrations (how-to)",
    items: [
      { text: "Microsoft Foundry", link: "/integrations/microsoft-foundry" },
      { text: "Azure DevOps", link: "/integrations/azure-devops" },
      { text: "GitHub Actions", link: "/integrations/github-actions" },
      { text: "Amazon Bedrock", link: "/integrations/amazon-bedrock" },
      { text: "Other providers", link: "/integrations/other-providers" },
      { text: "Local developer", link: "/integrations/local-developer" },
      { text: "Bitbucket and GitLab", link: "/integrations/bitbucket-gitlab" },
    ],
  },
  {
    text: "Reference",
    items: [
      { text: "Commands", link: "/reference/commands" },
      { text: "Configuration", link: "/reference/configuration" },
      { text: "Environment variables", link: "/reference/environment" },
      { text: "Exit codes", link: "/reference/exit-codes" },
    ],
  },
  {
    text: "Concepts",
    items: [
      { text: "How it works", link: "/concepts/how-it-works" },
      { text: "Contextual awareness", link: "/concepts/contextual-awareness" },
      { text: "Memory and privacy", link: "/concepts/memory-and-privacy" },
      { text: "Choosing models", link: "/concepts/choosing-models" },
    ],
  },
  {
    text: "Help",
    items: [{ text: "Troubleshooting", link: "/troubleshooting" }],
  },
];

const frNav: DefaultTheme.NavItem[] = [
  { text: "Démarrer", link: "/fr/guide/getting-started" },
  { text: "Intégrations", link: "/fr/integrations/microsoft-foundry" },
  { text: "Référence", link: "/fr/reference/commands" },
  { text: "Concepts", link: "/fr/concepts/how-it-works" },
  { text: "Dépannage", link: "/fr/troubleshooting" },
];

const frSidebar: DefaultTheme.Sidebar = [
  {
    text: "Tutoriel",
    items: [{ text: "Premiers pas", link: "/fr/guide/getting-started" }],
  },
  {
    text: "Intégrations (guides pratiques)",
    items: [
      { text: "Microsoft Foundry", link: "/fr/integrations/microsoft-foundry" },
      { text: "Azure DevOps", link: "/fr/integrations/azure-devops" },
      { text: "GitHub Actions", link: "/fr/integrations/github-actions" },
      { text: "Amazon Bedrock", link: "/fr/integrations/amazon-bedrock" },
      { text: "Autres fournisseurs", link: "/fr/integrations/other-providers" },
      { text: "Poste de développeur", link: "/fr/integrations/local-developer" },
      { text: "Bitbucket et GitLab", link: "/fr/integrations/bitbucket-gitlab" },
    ],
  },
  {
    text: "Référence",
    items: [
      { text: "Commandes", link: "/fr/reference/commands" },
      { text: "Configuration", link: "/fr/reference/configuration" },
      { text: "Variables d'environnement", link: "/fr/reference/environment" },
      { text: "Codes de sortie", link: "/fr/reference/exit-codes" },
    ],
  },
  {
    text: "Concepts",
    items: [
      { text: "Fonctionnement", link: "/fr/concepts/how-it-works" },
      { text: "Conscience du contexte", link: "/fr/concepts/contextual-awareness" },
      { text: "Mémoire et confidentialité", link: "/fr/concepts/memory-and-privacy" },
      { text: "Choisir les modèles", link: "/fr/concepts/choosing-models" },
    ],
  },
  {
    text: "Aide",
    items: [{ text: "Dépannage", link: "/fr/troubleshooting" }],
  },
];

export default defineConfig({
  base: BASE,
  title: "air-review",
  description: "Contextual AI code review for your pull requests, from the command line and from your CI.",
  lastUpdated: true,
  cleanUrls: true,
  head: [["link", { rel: "icon", href: `${BASE}favicon.svg` }]],
  themeConfig: {
    search: {
      provider: "local",
      options: {
        locales: {
          fr: {
            translations: {
              button: { buttonText: "Rechercher", buttonAriaLabel: "Rechercher" },
              modal: {
                displayDetails: "Afficher la liste détaillée",
                resetButtonTitle: "Effacer la recherche",
                backButtonTitle: "Fermer la recherche",
                noResultsText: "Aucun résultat pour",
                footer: {
                  selectText: "pour sélectionner",
                  selectKeyAriaLabel: "entrée",
                  navigateText: "pour naviguer",
                  navigateUpKeyAriaLabel: "flèche haut",
                  navigateDownKeyAriaLabel: "flèche bas",
                  closeText: "pour fermer",
                  closeKeyAriaLabel: "échap",
                },
              },
            },
          },
        },
      },
    },
    outline: { level: [2, 3] },
  },
  locales: {
    root: {
      label: "English",
      lang: "en",
      themeConfig: {
        nav: enNav,
        sidebar: enSidebar,
        outlineTitle: "On this page",
        lastUpdatedText: "Last updated",
        docFooter: { prev: "Previous page", next: "Next page" },
        footer: {
          message: "Released under the MIT License.",
          copyright: "air-review documentation",
        },
      },
    },
    fr: {
      label: "Français",
      lang: "fr",
      link: "/fr/",
      description:
        "Revue de code par IA, contextuelle, pour vos pull requests, en ligne de commande et dans votre CI.",
      themeConfig: {
        nav: frNav,
        sidebar: frSidebar,
        outlineTitle: "Sur cette page",
        lastUpdatedText: "Dernière mise à jour",
        docFooter: { prev: "Page précédente", next: "Page suivante" },
        returnToTopLabel: "Retour en haut",
        sidebarMenuLabel: "Menu",
        darkModeSwitchLabel: "Apparence",
        langMenuLabel: "Changer de langue",
        footer: {
          message: "Publié sous licence MIT.",
          copyright: "Documentation air-review",
        },
      },
    },
  },
});
