'use strict';

/**
 * A set of functions called "actions" for `admin`
 */

module.exports = {
  get_settings: async (ctx) => {
    /* This function known from node_modules/@strapi/plugin-users-permissions/server/controllers/settings.js -> getAdvancedSettings */
    const settings = await strapi
      .store({ type: 'plugin', name: 'users-permissions', key: 'advanced' })
      .get();

    if (!settings) {
      return ctx.internalServerError(null, [{ messages: [{ id: "Could not get strapi settings" }] }]);
    }

    const strapi_registrations_allowed = settings["allow_register"];
    const strapi_default_role = settings["default_role"];

    // TODO: Query setting collection

    ctx.body = {
      strapi_registrations_allowed,
      strapi_default_role
    };
  },

  /**
   * API to change global settings, such as allowing registrations or allowing cpi etc.
   * 
   * NOTE: This intentionally does NOT return anything to caller
   * For that, you should use get_settings(), that way caller can be sure that it is modified
   */
  change_settings: async (ctx) => {
    const strapi_payload = {
      allow_register: true
    };

    /* This function known from node_modules/@strapi/plugin-users-permissions/server/controllers/settings.js -> updateAdvancedSettings */
    // Assuming it will not fail, if it does, it is 500 InternalServerError eitherways
    await strapi
      .store({ type: 'plugin', name: 'users-permissions', key: 'advanced' })
      .set({ value: strapi_payload });

    // TODO: Query setting collection

    ctx.body = "ok";
  }
};
