'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const _ = require('lodash');
const utils = require('@strapi/utils');
const { yup, validateYupSchema } = require('@strapi/utils');
const { sanitize } = utils;
const { ApplicationError, ValidationError } = utils.errors;

const emailRegExp = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const sanitizeUser = async (user, ctx) => {
  const { auth } = ctx.state;
  const userSchema = strapi.getModel('plugin::users-permissions.user');

  const sanitized_user = await sanitize.contentAPI.output(user, userSchema, { auth });

  return {...sanitized_user, role: user.role};
};

const callbackBodySchema = yup.object().shape({
  identifier: yup.string().required(),
  password: yup.string().required(),
});

const registerBodySchema = yup.object().shape({
  email: yup
    .string()
    .email()
    .required(),
  password: yup.string().required(),
});

const validateCallbackBody = validateYupSchema(callbackBodySchema);
const validateRegisterBody = validateYupSchema(registerBodySchema);

// Creating these function based on reading code of node_modules/@strapi/plugin-users-permissions/server/services/user.js and getService used in server/controllers/auth.js
function getServiceUser() {
  return {
    validatePassword: (password, hash) => {
      return bcrypt.compare(password, hash);
    },
    isHashed: (password) => {
      if (typeof password !== 'string' || !password) {
        return false;
      }

      return password.split('$').length === 4;
    },
    add: async (values) => {
      return strapi.entityService.create('plugin::users-permissions.user', {
        data: values,
        populate: ['role'],
      });
    }
  }
}

function getServiceJWT() {
  return {
    issue: (payload, jwtOptions = {}) => {
      _.defaults(jwtOptions, strapi.config.get('plugin.users-permissions.jwt'));
      return jwt.sign(
        _.clone(payload.toJSON ? payload.toJSON() : payload),
        strapi.config.get('plugin.users-permissions.jwtSecret'),
        jwtOptions
      );
    }
  }
}

module.exports = {
  /* Code copied/modified of 'callback' function, in node_modules/@strapi/plugin-users-permissions/server/controllers/auth.js
   *
   * Modified to also return the role of user who logged in
   */
  login_plus_role: async (ctx, next) => {
    const provider = ctx.params.provider || 'local';
    const params = ctx.request.body;

    const store = strapi.store({ type: 'plugin', name: 'users-permissions' });

    if (provider === 'local') {
      if (!_.get(await store.get({ key: 'grant' }), 'email.enabled')) {
        throw new ApplicationError('This provider is disabled');
      }

      await validateCallbackBody(params);

      const query = { provider };

      // Check if the provided identifier is an email or not.
      const isEmail = emailRegExp.test(params.identifier);

      // Set the identifier to the appropriate query field.
      if (isEmail) {
        query.email = params.identifier.toLowerCase();
      } else {
        query.username = params.identifier;
      }

      // Check if the user exists.
      // NOTE @adig Modification: Added "populate: ['role']", so it will now return role too
      const user = await strapi.query('plugin::users-permissions.user').findOne({
        where: query,
        populate: ["role"]
      });

      if (!user) {
        throw new ValidationError('Invalid identifier or password');
      }

      if (
        _.get(await store.get({ key: 'advanced' }), 'email_confirmation') &&
        user.confirmed !== true
      ) {
        throw new ApplicationError('Your account email is not confirmed');
      }

      if (user.blocked === true) {
        throw new ApplicationError('Your account has been blocked by an administrator');
      }

      // The user never authenticated with the `local` provider.
      if (!user.password) {
        throw new ApplicationError(
          'This user never set a local password, please login with the provider used during account creation'
        );
      }

      const validPassword = await getServiceUser().validatePassword(
        params.password,
        user.password
      );

      if (!validPassword) {
        throw new ValidationError('Invalid identifier or password');
      } else {
        ctx.send({
          jwt: getServiceJWT().issue({
            id: user.id,
          }),
          user: await sanitizeUser(user, ctx),
        });
      }
    } else {
      ctx.internalServerError("TODO: Third-party providers not implemented", {});
    }
  },

  register_plus_role: async (ctx) => {
    const pluginStore = await strapi.store({ type: 'plugin', name: 'users-permissions' });

    const settings = await pluginStore.get({
      key: 'advanced',
    });

    if (!settings.allow_register) {
      throw new ApplicationError('Register action is currently disabled');
    }

    const params = {
      ..._.omit(ctx.request.body, ['confirmed', 'confirmationToken', 'resetPasswordToken']),
      provider: 'local',
    };

    await validateRegisterBody(params);

    // Throw an error if the password selected by the user
    // contains more than three times the symbol '$'.
    if (getServiceUser().isHashed(params.password)) {
      throw new ValidationError(
        'Your password cannot contain more than three times the symbol `$`'
      );
    }

    const role = await strapi
      .query('plugin::users-permissions.role')
      .findOne({ where: { type: settings.default_role } });

    if (!role) {
      throw new ApplicationError('Impossible to find the default role');
    }

    // Check if the provided email is valid or not.
    const isEmail = emailRegExp.test(params.email);

    if (isEmail) {
      params.email = params.email.toLowerCase();
    } else {
      throw new ValidationError('Please provide a valid email address');
    }

    params.role = role.id;

    const user = await strapi.query('plugin::users-permissions.user').findOne({
      where: { email: params.email },
    });

    if (user && user.provider === params.provider) {
      throw new ApplicationError('Email is already taken');
    }

    if (user && user.provider !== params.provider && settings.unique_email) {
      throw new ApplicationError('Email is already taken');
    }

    try {
      if (!settings.email_confirmation) {
        params.confirmed = true;
      }

      const user = await getServiceUser().add(params);

      console.log({ user });

      const sanitizedUser = await sanitizeUser(user, ctx);

      console.log({ sanitizedUser });

      if (settings.email_confirmation) {
        try {
          return ctx.internalServerError("TODO: Not yet Implemented", {});
        } catch (err) {
          throw new ApplicationError(err.message);
        }

        return ctx.send({ user: sanitizedUser });
      }

      const jwt = getServiceJWT().issue(_.pick(user, ['id']));

      return ctx.send({
        jwt,
        user: sanitizedUser,
      });
    } catch (err) {
      if (_.includes(err.message, 'username')) {
        throw new ApplicationError('Username already taken');
      } else if (_.includes(err.message, 'email')) {
        throw new ApplicationError('Email already taken');
      } else {
        strapi.log.error(err);
        throw new ApplicationError('An error occurred during account creation');
      }
    }
  },
};
