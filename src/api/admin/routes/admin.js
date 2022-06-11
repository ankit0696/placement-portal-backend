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
      method: 'GET',
      path: '/admin/eligiblejobs',
      handler: 'job.get_eligible_jobs',
      config: {
        policies: []
      }
    }
  ],
};
