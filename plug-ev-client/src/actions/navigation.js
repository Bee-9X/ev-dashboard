//      .....................................................
//       __________
//      |     __   \
//      |_   |  |   \
//       |   |__|   /		               _____\""\   /""/
//       |    ___  (__                    /  __  \  \ /  /
//       |   |   |    ) ___   ___   ___  /  |  |  \  X  /
//      _|   |   |   / / _ \ / _ \ |___| \  |__|  /  X  \
//      |    |___|  / |  __/|  __/        \__    /  / \  \
//      |__________/   \___| \___|           /  /__/   \__\
//      I N N O V A T I O N S   L A B       /  /
//                                         /__/
//       .....................................................

/* eslint-disable import/prefer-default-export */

export const OPEN_SIDEBAR = 'OPEN_SIDEBAR';
export const CLOSE_SIDEBAR = 'CLOSE_SIDEBAR';
export const CHANGE_ACTIVE_SIDEBAR_ITEM = 'CHANGE_ACTIVE_SIDEBAR_ITEM';
export const CHANGE_SIDEBAR_POSITION = 'CHANGE_SIDEBAR_POSITION';
export const CHANGE_SIDEBAR_VISIBILITY = 'CHANGE_SIDEBAR_VISIBILITY';

export function openSidebar() {
    return {
        type: OPEN_SIDEBAR,
    };
}

export function changeSidebarPosition(nextPosition) {
    return {
        type: CHANGE_SIDEBAR_POSITION,
        payload: nextPosition,
    };
}

export function closeSidebar() {
    return {
        type: CLOSE_SIDEBAR,
    };
}

export function changeActiveSidebarItem(activeItem) {
    return {
        type: CHANGE_ACTIVE_SIDEBAR_ITEM,
        activeItem,
    };
}

export function changeSidebarVisibility(nextVisibility) {
    return {
        type: CHANGE_SIDEBAR_VISIBILITY,
        payload: nextVisibility,
    };
}