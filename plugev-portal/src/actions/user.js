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


export const LOGIN_SUCCESS = 'LOGIN_SUCCESS';
export const LOGIN_FAILURE = 'LOGIN_FAILURE';
export const LOGOUT_REQUEST = 'LOGOUT_REQUEST';
export const LOGOUT_SUCCESS = 'LOGOUT_SUCCESS';

export function receiveLogin() {
    return {
        type: LOGIN_SUCCESS
    };
}

function loginError(payload) {
    return {
        type: LOGIN_FAILURE,
        payload,
    };
}

function requestLogout() {
    return {
        type: LOGOUT_REQUEST,
    };
}

export function receiveLogout() {
    return {
        type: LOGOUT_SUCCESS,
    };
}

// Logs the user out
export function logoutUser() {
    return (dispatch) => {
        dispatch(requestLogout());
        localStorage.removeItem('authenticated');
        dispatch(receiveLogout());
    };
}

export function loginUser(creds) {
    return (dispatch) => {

        dispatch(receiveLogin());

        if (creds.loginEmail === '09madhuma@gmail.com' && creds.loginPassword === '123456') {
            localStorage.setItem('authenticated', true)
        } else {
            dispatch(loginError('Invalid email or password.'));
        }
    }
}
