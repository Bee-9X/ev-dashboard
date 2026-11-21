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

import {toast} from 'react-toastify';

export const REGISTER_REQUEST = 'REGISTER_REQUEST';
export const REGISTER_SUCCESS = 'REGISTER_SUCCESS';
export const REGISTER_FAILURE = 'REGISTER_FAILURE';

export function receiveRegister() {
    return {
        type: REGISTER_SUCCESS
    };
}

export function registerError(payload) {
    return {
        type: REGISTER_FAILURE,
        payload,
    };
}

export function registerUser(payload) {
    return (dispatch) => {
        if (payload.creds.regEmail.length > 0 && payload.creds.password.length > 0) {
            toast.success("You've been registered successfully");
            payload.history.push('/login');
        } else {
            dispatch(registerError('Something was wrong. Try again'));
        }
    }
}
