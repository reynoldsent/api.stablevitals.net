const canAccessHorse = (user, horse) => {
  if (horse.barnId.toString() !== user.barnId.toString()) return false;
  if (user.role === 'view_only') {
    return user.allowedHorseIds.map(String).includes(horse._id.toString());
  }
  return true;
};

module.exports = { canAccessHorse };
