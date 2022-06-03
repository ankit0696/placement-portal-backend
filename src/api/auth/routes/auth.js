/** This is a modified version of the default `/auth/local` route
 * Taken from node_modules/@strapi/plugin-users-permissions/server/routes/content-api/auth.js
 */
module.exports = {
  routes: [
    {
     method: 'POST',
     path: '/auth/login-role',
     handler: 'auth.login_plus_role',
     config: {
      middlewares: ['plugin::users-permissions.rateLimit'],
      prefix: '',
    },
  },
  {
    method: 'POST',
    path: '/auth/register-role',
    handler: 'auth.register_plus_role',
    config: {
      middlewares: ['plugin::users-permissions.rateLimit'],
      prefix: '',
    },
  },
  ],
};
