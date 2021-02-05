async function main() {

  // define default prefs and migrate legacy settings
  let defaultPrefs = {
    "version": "@@EXTVERSION@@"
  };
  await editEmailSubjectPreferences.setDefaults(defaultPrefs);

  messenger.menus.create({
    contexts : ["message_list"],
    id: "edit_email_subject_entry",
    onclick : editEmailSubjectMain.edit.bind(editEmailSubjectMain),
    title: messenger.i18n.getMessage("lang.menuTitle")
  });
  
}

main();
