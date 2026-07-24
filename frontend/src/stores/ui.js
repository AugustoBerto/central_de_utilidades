import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', {
  state: () => ({ sidebarCollapsed: false, mobileNavigationOpen: false }),
  actions: {
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
    },
    openMobileNavigation() {
      this.mobileNavigationOpen = true;
    },
    closeMobileNavigation() {
      this.mobileNavigationOpen = false;
    }
  }
});
