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

export const PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST';
export const PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS';
export const PASSWORD_RESET_FAILURE = 'PASSWORD_RESET_FAILURE';

export function receivePasswordReset() {
    return {
        type: PASSWORD_RESET_SUCCESS
    };
}

export function PasswordResetError(payload) {
    return {
        type: PASSWORD_RESET_FAILURE,
        payload,
    };
}

export function userPasswordReset(payload) {
    return (dispatch) => {
        if (payload.creds.email.length > 0 && payload.creds.newPassword.length > 0) {
            toast.success("You've been reset password successfully");
            payload.history.push('/login');
        } else {
            console.log("man weda");
            dispatch(PasswordResetError('Something was wrong. Try again'));
        }
    }
}
