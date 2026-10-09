import express from 'express'
const app = express();

import path from 'path'

import pg from 'pg'

import session from 'express-session'

const blogdb = new pg.Client({
    user: 'postgres',
    host: 'localhost',
    database: 'blogdb',
    password: 'IzzyEVJ1',
    port: 5432
});

blogdb.connect();

import bodyParser from 'body-parser'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))

const port = 3000


app.set('view engine', 'ejs');


let blogPosts = [];


// Express looks inside the "public" folder for static files
app.use(express.static(path.join(__dirname, 'public')));

app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: 'my-blog-project-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use((req, res, next) => {
    res.locals.currentUser = req.session.user_id || null;
    res.locals.currentName = req.session.name || null;
    next();
});

app.get("/", (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/signin');
    }

    res.render('index');
});


app.post('/submit', async (req, res) => {
    if (!req.session.user_id) {
        return res.redirect('/signin');
    }

    const { title, text } = req.body;

    // Retrieve user information from the session
    const creator_user_id = req.session.user_id;
    const creator_name = req.session.name;

    try {
        await blogdb.query(
            `INSERT INTO blogs
            (creator_user_id, creator_name, title, body, date_created)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
            [creator_user_id, creator_name, title, text]
        );

        console.log("Blog successfully saved to database!");

        res.redirect('/blogs');

    } catch (error) {
        console.error("Error saving blog:", error);
        res.status(500).send("Could not save blog");
    }
});

app.get('/blogs', async (req, res) => {
    try {
        const result = await blogdb.query(
            `SELECT * FROM blogs
             ORDER BY date_created DESC`
        );

        console.log("Blogs retrieved:", result.rows);

        res.render('blogs', {
            posts: result.rows,
            currentUser: req.session.user_id || null,
            currentName: req.session.name || null
        });

    } catch (error) {
        console.error("Error retrieving blogs:", error);
        res.status(500).send("Could not retrieve blogs");
    }
});



app.get('/blogs/edit/:id', async (req, res) => {
    // Check whether the user is signed in
    if (!req.session.user_id) {
        return res.redirect('/signin');
    }

    const postId = req.params.id;

    try {
        const result = await blogdb.query(
            `SELECT * FROM blogs
             WHERE blog_id = $1 AND creator_user_id = $2`,
            [postId, req.session.user_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).send("Post not found or access denied");
        }

        res.render('edit', {
            post: result.rows[0],
            id: postId
        });

    } catch (error) {
        console.error("Error retrieving blog:", error);
        res.status(500).send("Could not load blog");
    }
});

app.get('/signup', (req, res) => {
    res.render('signup');
});

app.post('/signup', async (req, res) => {
    const { user_id, password, name } = req.body;

    console.log("Form data:", req.body);
    console.log("About to query database...");

    try{
        await blogdb.query(
            "INSERT INTO users (user_id, password, name) VALUES ($1, $2, $3)",
            [user_id, password, name]
        );

        console.log("DATABASE QUERY FINISHED");
    
        res.redirect('/blogs')
    } catch (error) {
        if (error.code ==='23505') {
            res.render('signup', {
                error: "That user ID is already taken!"
            });
            
        } else {
            console.log(error);
            res.status(500).send("Something went wrong, please try again.");
        }
    }
});

app.get('/signin', (req, res) => {
    res.render('signin');
});

app.post('/signin', async (req, res) => {
    const { user_id, password } = req.body;

    console.log("Form data:", req.body);
    console.log("About to query database...");
    try {
        // Find the user in the database
        const result = await blogdb.query(
            'SELECT * FROM users WHERE user_id = $1',
            [user_id]
        );

        // Check if the user exists
        if (result.rows.length === 0) {
            return res.status(401).render('signin', {
                error: "Invalid username or password!"
            });
        }

        const user = result.rows[0];

        // Check password (only for your current plaintext setup)
        if (user.password !== password) {
            return res.status(401).render('signin', {
                error: "Invalid username or password!"
            });
        }
        req.session.regenerate((err) => {
            if (err) {
                console.error(err);
                return res.status(500).send("Server error");
            }

            req.session.user_id = user.user_id;
            req.session.name = user.name;

            req.session.save((err) => {
                if (err) {
                    console.error(err);
                    return res.status(500).send("Server error");
                }

                console.log("Login successful!");
                res.redirect('/blogs');
            });
        });

    } catch (err) {
        console.error("Database error:", err);
        res.status(500).send("Server error");
    }
});

// Handles the form submission from edit page
app.post('/blogs/update/:id', async (req, res) => {
    
    if (!req.session.user_id) {
        return res.redirect('/signin');
    }

    const postId = req.params.id;
    const { title, text } = req.body;

    try {
        const result = await blogdb.query(
            `UPDATE blogs
             SET title = $1, body = $2
             WHERE blog_id = $3 AND creator_user_id = $4
             RETURNING blog_id`,
            [title, text, postId, req.session.user_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).send("Post not found or access denied");
        }

        console.log("Blog updated successfully!");
        res.redirect('/blogs');

    } catch (error) {
        console.error("Error updating blog:", error);
        res.status(500).send("Could not update blog");
    }
});

app.post('/blogs/delete/:id', async (req, res) => {

    if (!req.session.user_id) {
        return res.status(401).send("Please sign in");
    }

    const postId = req.params.id;

    try {
        const result = await blogdb.query(
            `DELETE FROM blogs
             WHERE blog_id = $1 AND creator_user_id = $2
             RETURNING blog_id`,
            [postId, req.session.user_id]
        );

        if (result.rowCount === 0) {
            return res.status(404).send("Post not found or access denied");
        }

        console.log("Blog deleted successfully!");
        res.sendStatus(200);

    } catch (error) {
        console.error("Error deleting blog:", error);
        res.status(500).send("Could not delete blog");
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error(error);
            return res.status(500).send("Could not log out");
        }

        res.clearCookie('connect.sid');
        res.redirect('/signin');
    });
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})