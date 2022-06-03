* `roll` should not be unique at beginning, since someone may send a fake request blocking actual student from registering. But after approval, it should be unique, that is, no other student registers with that roll
* How to handle "job approval requests" and "student approval requests" ? Currently Request collection me ek student ka relation hai
* Separate controller code into multiple files
* Password reset:
  Old: Either give current and new password. Or send request to admin... I think then admin will set a temporary password, then user can change by giving it and new passwords
  Proposed: Since 'User' password will have to be changed too, requires email sent.
  Just 'Making it work'(TM): Delete previous user object, create new 'User' object with new password, and replace with it in Student.user_relation
* "approved: created" maybe redundant, since just after register, user HAS to call submit-for-approval which sets approved: "pending"