/// <reference path="../pb_data/types.d.ts" />

// Stacked initial schema:
//   - extends the built-in `users` collection with a `role` text field
//     ('user' default, can be 'admin')
//   - creates a `projects` collection with the JSON snapshot column
//
// Access rules:
//   - Users see / mutate only their own projects (owner = @request.auth.id)
//   - Admins (users.role = 'admin') can additionally read every project

migrate(
  (db) => {
    const dao = new Dao(db);

    // ---- users.role ------------------------------------------------------
    const users = dao.findCollectionByNameOrId('users');
    if (!users.schema.getFieldByName('role')) {
      users.schema.addField(
        new SchemaField({
          name: 'role',
          type: 'select',
          required: true,
          options: {
            maxSelect: 1,
            values: ['user', 'admin'],
          },
        }),
      );
      // Default to 'user' on create. Admins are promoted manually via the
      // PocketBase admin UI (Collections → users → edit row → set role).
      users.schema.getFieldByName('role').system = false;
      dao.saveCollection(users);
    }

    // ---- projects collection --------------------------------------------
    let projects;
    try {
      projects = dao.findCollectionByNameOrId('projects');
    } catch (_) {
      projects = null;
    }
    if (!projects) {
      projects = new Collection({
        name: 'projects',
        type: 'base',
        schema: [
          {
            name: 'owner',
            type: 'relation',
            required: true,
            options: {
              collectionId: users.id,
              cascadeDelete: true,
              minSelect: 1,
              maxSelect: 1,
            },
          },
          {
            name: 'name',
            type: 'text',
            required: true,
            options: { min: 1, max: 200 },
          },
          {
            name: 'snapshot',
            type: 'json',
            required: true,
            options: { maxSize: 5242880 }, // 5 MB
          },
        ],
        // Rules — empty means "admins only" in PocketBase. We give regular
        // users access via these expressions, then admins (collection-level
        // bypass) keep the keys to the kingdom.
        listRule:
          "owner.id = @request.auth.id || @request.auth.role = 'admin'",
        viewRule:
          "owner.id = @request.auth.id || @request.auth.role = 'admin'",
        // Only the owner can create / update / delete their own projects.
        createRule:
          "@request.auth.id != '' && @request.data.owner = @request.auth.id",
        updateRule: 'owner.id = @request.auth.id',
        deleteRule: 'owner.id = @request.auth.id',
      });
      dao.saveCollection(projects);
    }
  },
  (db) => {
    // down migration — drops the projects collection and the role field
    const dao = new Dao(db);
    try {
      const projects = dao.findCollectionByNameOrId('projects');
      dao.deleteCollection(projects);
    } catch (_) {
      // already gone
    }
    try {
      const users = dao.findCollectionByNameOrId('users');
      const role = users.schema.getFieldByName('role');
      if (role) {
        users.schema.removeField(role.id);
        dao.saveCollection(users);
      }
    } catch (_) {
      // ignore
    }
  },
);
