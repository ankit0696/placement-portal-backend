module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/admin/settings',
      handler: 'admin.get_settings',
      config: {
        policies: [],
        middlewares: [],
      },
    },
    {
      method: 'PUT',
      path: '/admin/settings',
      handler: 'admin.change_settings',
      config: {
        policies: []
      },
    },
    {
      method: 'POST',
      path: '/admin/register-with-role',
      handler: 'auth.register_with_role',
      config: {
        middlewares: ['plugin::users-permissions.rateLimit'],
        prefix: '',
      },
    },
    {
      method: 'GET',
      path: '/admin/eligiblejobs',
      handler: 'job.get_eligible_jobs',
      config: {
        policies: []
      }
    }
  ],
};
