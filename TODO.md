* `roll` should not be unique at beginning, since someone may send a fake request blocking actual student from registering. But after approval, it should be unique, that is, no other student registers with that roll
* [Reject] How to handle "job approval requests" and "student approval requests" ? Currently Request collection me ek student ka relation hai
* Password reset:
  Old: Either give current and new password. Or send request to admin... I think then admin will set a temporary password, then user can change by giving it and new passwords
  Proposed: Since 'User' password will have to be changed too, requires email sent.
  Just 'Making it work'(TM): Delete previous user object, create new 'User' object with new password, and replace with it in Student.user_relation
* "approved: created" maybe redundant, since just after register, user HAS to call submit-for-approval which sets approved: "pending"
* `role` needs to be asked from frontend side. Since, default role when using http://localhost:1337/api/auth/register-role or /api/local/auth/register is "Authenticated", so superadmin will have to change this role once approved

* Minimum Password length >=6
* [Done] Don't allow any change or get_eligible_jobs after 'Submit for approval'
* Coordinator usernames, they may have 2 accounts, one as student and one as coordinator
* When to allow changes to `profile_picture` and `current_sem` ?

* [Done] Admin: Disallow registrations
* [Done] Admin: Common collection for things like allow student registrations or allow CPI change by all students
* Admin: Approving multiple students at a time

* [Done] upload on modify route
* [Done] applied jobs

* [Done] eligible jobs
* [Done] apply
* [Done] company component
* is approved company

* Shouldn't company "has many jobs", instead of "job belongs to one company" relation. If company is removed then all its jobs should also.

* About searching using javascript datetime, forums says this: (ref: https://forum.strapi.io/t/query-by-month-or-by-year-or-by-specific-day/3802/6):

> Let’s your timezone from server differs with 12 hours from database, then if you send the request from server with 2020-01-01T00:00:00, then in db it will search 2019-12-31T12:00:00.

