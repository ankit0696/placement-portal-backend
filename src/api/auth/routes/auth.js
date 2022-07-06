module.exports = {
  routes: [
    {
      method: 'PUT',
      path: '/auth/reset-password',
      handler: 'auth.reset_password',
      config: {
        policies: [],
        middlewares: [],
      },
    },
  ],
};
