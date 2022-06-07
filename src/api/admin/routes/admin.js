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
      method: 'POST',
      path: '/admin/settings',
      handler: 'admin.change_settings',
      config: {
        policies: []
      }
    }
  ],
};
