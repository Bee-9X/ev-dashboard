import {PASSWORD_RESET_FAILURE, PASSWORD_RESET_REQUEST, PASSWORD_RESET_SUCCESS} from '../actions/passwordReset';

export default function forgotPassword(state = {
    isFetching: false,
    errorMessage: ''
}, action) {
    switch (action.type) {
        case PASSWORD_RESET_REQUEST:
            return Object.assign({}, state, {
                isFetching: true,
            });
        case PASSWORD_RESET_SUCCESS:
            return Object.assign({}, state, {
                isFetching: false,
                errorMessage: '',
            });
        case PASSWORD_RESET_FAILURE:
            return Object.assign({}, state, {
                isFetching: false,
                errorMessage: action.payload,
            });
        default:
            return state;
    }
}
