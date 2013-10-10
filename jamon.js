var http = require('http');
var https = require('https');
var express = require('express');
var fs = require('fs');
var async = require('async');

// bring in external javascript
eval(fs.readFileSync(__dirname + '/scripts/html-css-sanitizer-minified.js')+'');
eval(fs.readFileSync(__dirname + '/scripts/pretty.js')+'');

var app = express();

//TODO serve styles, scripts, and images using NGINX instead of express for better performance
app.use(express.favicon(__dirname + '/images/favicon.ico'));
app.use("/styles", express.static(__dirname + '/styles'));
app.use("/scripts", express.static(__dirname + '/scripts'));
app.use("/images", express.static(__dirname + '/images'));

//TODO Obviously hardcoded secrets are bad form, store these in a config file that isn't version controlled
app.use(express.cookieParser('drewSchuster'));
app.use(express.session({secret: '1234567890QWERTY'}));
app.use(express.bodyParser());

app.set('views', __dirname + '/views');
app.set('view engine', 'jade' );
app.set('view options', {layout: true});

//function sanitizes JSON responses from feed wrangler, as well as makes some of the data easier to display
function massageResponse(jsonResponse, path, maxCount, callback){
      
        // If we have acquired the maximum number of elements, denote that there might be more
        if (jsonResponse.count == maxCount) {
          jsonResponse.count += "+";
        }

        if (jsonResponse.feed_items != null) {
          for (item in jsonResponse.feed_items) { 
            //Sanitize the body and title of all feed items
            jsonResponse.feed_items[item].body = html_sanitize(jsonResponse.feed_items[item].body,
              function(url) { return url /* rewrite urls if needed */ },
              function(id) { return id; /* rewrite ids, names and classes if needed */ });
            jsonResponse.feed_items[item].title = html_sanitize(jsonResponse.feed_items[item].title,
              function(url) { return url /* rewrite urls if needed */ },
              function(id) { return id; /* rewrite ids, names and classes if needed */ });

            //Create a human readable timestamp
            var timestamp = jsonResponse.feed_items[item].created_at * 1000;
            var date = new Date(timestamp);
            jsonResponse.feed_items[item].created_at = prettyDate(date);
          }
        }
        callback(jsonResponse, path);
};

// access token is stored in cookie as well as session.  If session expires, check cookie for access token to avoid having to reauthenticate
function checkForAccessToken(req, res) {
  if (!req.session.access_token) {
    if (req.signedCookies['access_token']) {
      req.session.access_token = req.signedCookies['access_token'];
      if (req.signedCookies['read_later_service']) {
        req.session.read_later_service = req.signedCookies['read_later_service'];
      }
      res.redirect('/updateFeedList');
      return false;
    } else {
      res.redirect('');
      return false;
    }
  }
  return true;
};

//Supports the ability to asynchronously make multiple API requests to allow for loading > 100 feed items
function paginatedRequest(requestData, callback) {
  var newPath = requestData.path + "&offset=" + requestData.offset;
  feedWranglerRequest(newPath, false, function(jsonResponse, newPath) {
    if (jsonResponse != null) {
      if (jsonResponse.count == "100") {
        callback(null, jsonResponse);
      } else {
        callback('break', jsonResponse);
      }
    } else {
      callback('break', null);
    }
  });
};

// basic parsing of API response
function handleFeedWranglerResponse(path, concatenateResults, body, callback){
  try {
    var jsonResponse = JSON.parse(body); 
  } catch (e) {
    console.log("Response is not valid json, ignoring: " + e);
    callback(null, path);
    return;
  }

  // All feed wrangler API requests return a result, that is set to success if successful
  if (jsonResponse.result === "success") {
    //TODO: Clean up this logic.  Basically this determines if more than 100 results are desired, since feed
    // wrangler only returns 100 elements at a time
    if (jsonResponse.count == "100" && path.indexOf('offset') == -1 && concatenateResults) {
      // Make multiple requests to get up to 500 results
      async.mapSeries([
          { path: path, offset: 100},
          { path: path, offset: 200},
          { path: path, offset: 300},
          { path: path, offset: 400},
      ],
      paginatedRequest,
      function(err, results){
          // Concatenate the responses into one feed_items array
          for (i in results) {
            jsonResponse.feed_items = jsonResponse.feed_items.concat(results[i].feed_items);
            jsonResponse.count += results[i].count; 
          }
          massageResponse(jsonResponse, path, "500", callback);
      });
    } else {
      massageResponse(jsonResponse, path, (path.indexOf('offset') == -1) ? "100" : "", callback);
    }
  } else {
    console.log("Request for " + path.replace(new RegExp("&password=.*&"),"&password=*****&") + " failed with error " + jsonResponse.error);
    callback(null, path);
  }
};

// function builds and makes an API call, and performs initial parsing of response
function feedWranglerRequest(path, concatenateResults, callback){
  var options = {
    host : 'feedwrangler.net',
    path : path,
    method : 'GET'
  };
  var request = https.get(options, function(response){
    var body = "";
    response.on('data', function(data) {
      body += data;
    });
    
    response.on('end', function() {
      handleFeedWranglerResponse(path, concatenateResults, body, callback);
    });
  });
  request.on('error', function(e) {
    console.log('Problem with request: ' + e.message);
  });
  request.end();
};

//Function to authenticate against feedwrangler api
function authenticate(req, res, demo) {
  var path;
  if (demo) {
    //TODO: Don't hardcode the password for the demo account here
    path = '/api/v2/users/authorize?email='+"dtschust%2Bdemo%40gmail.com"+'&password='+"qrkatgr7swE8Ya"+'&client_key=b4c79a804eb6de0b3bb36e2be595cebc';
  } else {
    path = '/api/v2/users/authorize?email='+req.body.username+'&password='+req.body.pwd+'&client_key=b4c79a804eb6de0b3bb36e2be595cebc';
  }
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if (jsonResponse != null) {
      res.cookie('access_token',jsonResponse.access_token, {maxAge: 2592000000, signed:true });
      res.cookie('read_later_service',jsonResponse.user.read_later_service, {maxAge: 2592000000, signed:true });
      res.cookie('feeds',{ items: jsonResponse.feeds}, {maxAge: 2592000000, signed:true });
      req.session.access_token = jsonResponse.access_token;
      req.session.feeds = jsonResponse.feeds;
      req.session.read_later_service = jsonResponse.user.read_later_service;

      // Look up smart streams, which requires a separate API call
      var path = '/api/v2/streams/list?access_token='+req.session.access_token;
      feedWranglerRequest(path, false, function(jsonResponse,path) {
        if (jsonResponse != null) {
          req.session.streams = jsonResponse.streams;
        }
        res.render('successfulLogin');
       });
      
    } else {
      res.render('login', { error: "Failed Authentication" } );
    }
  });
};

/* Log in form */
app.get('/', function(req, res){
  if(req.session.access_token) {
    res.redirect('/feeds/unread');
  } else if (req.signedCookies['access_token']) {
      req.session.access_token = req.signedCookies['access_token'];
      if (req.signedCookies['read_later_service']) {
        req.session.read_later_service = req.signedCookies['read_later_service'];
      }
      res.redirect('/updateFeedList');
      return;
  }
  res.render('login');
});


/* Log In with demo account*/
app.get('/authenticateDemo', function(req, res){
  authenticate(req, res, true);
});

/* Log In */
app.post('/authenticate', function(req, res){
  authenticate(req, res);
});

/* Log out */
app.get('/logout', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }

  var path = '/api/v2/users/logout?access_token=' + req.session.access_token ;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if (jsonResponse != null) {
      req.session.access_token = null;
      res.clearCookie('access_token');
      res.render('logout');
    } else {
      res.end();
    }
  });
});

/* Add a feed*/
app.get('/addFeed/:access_token/:feed_url', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }
  var path = '/api/v2/subscriptions/add_feed?access_token='+req.params.access_token+'&feed_url='+req.params.feed_url;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      res.write("SUCCESS");
      res.end();
    } else {
      res.write("ERROR UPDATING STATUS");
      res.end();
    }
  });
});

/* Change feed item status */
app.get('/changeItemStatus/:access_token/:feed_item_id', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }

  var filterStatement = "";
  filterStatement += req.query.read != null ? "&read="+req.query.read : "";
  filterStatement += req.query.starred != null ? "&starred="+req.query.starred : "";
  filterStatement += req.query.read_later != null ? "&read_later="+req.query.read_later : "";
  var path = '/api/v2/feed_items/update?access_token='+req.params.access_token+'&feed_item_id='+req.params.feed_item_id + filterStatement;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      res.write("SUCCESS");
      res.end();
    } else {
      res.write("ERROR UPDATING STATUS");
      res.end();
    }
  });
});


/* Update feed list */
app.get('/updateFeedList', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }

  var path = '/api/v2/subscriptions/list?access_token=' + req.session.access_token;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      jsonResponse.access_token = req.session.access_token;
      req.session.feeds = jsonResponse.feeds;

      /* Look up smart streams */
      var path = '/api/v2/streams/list?access_token='+req.session.access_token;
      feedWranglerRequest(path, false, function(jsonResponse,path) {
        if (jsonResponse != null) {
          req.session.streams = jsonResponse.streams;
        }
        var backURL=req.header('Referer') || '/';
        res.redirect(backURL);
       });

    } else {
      req.session.access_token = null;
      res.clearCookie('access_token');
      res.redirect('');
    }
  });
});

/* Get one stream */
app.get('/loadStream/:stream_id', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }
  var path = '/api/v2/streams/stream_items?stream_id='+req.params.stream_id+'&access_token=' + req.session.access_token;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      jsonResponse.access_token = req.session.access_token;
      jsonResponse.feeds = req.session.feeds;
      jsonResponse.read_later_service = req.session.read_later_service;
      jsonResponse.streams = req.session.streams;

      jsonResponse.feed_name = "Stream " + req.params.stream_id;
      for (i in req.session.streams) {
        if(req.params.stream_id == req.session.streams[i].stream_id) {
          jsonResponse.feed_name = req.session.streams[i].title;
          break;
        }
      }

      res.render('index', jsonResponse);
    } else {
      req.session.access_token = null;
      res.clearCookie('access_token');
      res.redirect('');
    }
  });
});

/* Get One Feed */
app.get('/loadFeed/:feed_id/:read_status', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }
  var read_status = req.params.read_status == "unread" ? "&read=false" : "";
  var path = '/api/v2/feed_items/list?feed_id='+req.params.feed_id+read_status+'&access_token=' + req.session.access_token;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      jsonResponse.access_token = req.session.access_token;
      jsonResponse.feeds = req.session.feeds;
      jsonResponse.read_later_service = req.session.read_later_service;
      jsonResponse.streams = req.session.streams;
      if (jsonResponse.feed_items[0] != null) {
        jsonResponse.feed_name = jsonResponse.feed_items[0].feed_name;
      }

      if (path.indexOf("&read=false") != -1) {
        jsonResponse.read_status = "Unread";
      } else {
        jsonResponse.read_status = "All";
      }

      res.render('index', jsonResponse);
    } else {
      req.session.access_token = null;
      res.clearCookie('access_token');
      res.redirect('');
    }
  });
});

/* Search feeds*/
app.post('/search', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }

  var path = '/api/v2/feed_items/search?search_term=' + encodeURIComponent(req.body.search) + '&access_token=' + req.session.access_token;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      jsonResponse.access_token = req.session.access_token;
      jsonResponse.feeds = req.session.feeds;
      jsonResponse.read_later_service = req.session.read_later_service;
      jsonResponse.streams = req.session.streams;

      if (path.indexOf("&read=false") != -1) {
        jsonResponse.read_status = "Unread";
      } else {
        jsonResponse.read_status = "All";
      }
      jsonResponse.feed_name = "Search for " + req.body.search;
      res.render('index', jsonResponse);
    } else {
      req.session.access_token = null;
      res.clearCookie('access_token');
      res.redirect('');
    }
  });
});

/* Get all starred feeds*/
app.get('/starred/:read_status', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }

  var read_status = req.params.read_status == "unread" ? "&read=false" : "";
  var path = '/api/v2/feed_items/list?starred=true' + read_status + '&access_token=' + req.session.access_token;
  feedWranglerRequest(path, false, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      jsonResponse.access_token = req.session.access_token;
      jsonResponse.feeds = req.session.feeds;
      jsonResponse.read_later_service = req.session.read_later_service;
      jsonResponse.streams = req.session.streams;

      if (path.indexOf("&read=false") != -1) {
        jsonResponse.read_status = "Unread";
      } else {
        jsonResponse.read_status = "All";
      }
      jsonResponse.feed_name = "Starred"
      res.render('index', jsonResponse);
    } else {
      req.session.access_token = null;
      res.clearCookie('access_token');
      res.redirect('');
    }
  });
});

/* Get all feeds*/
app.get('/feeds/:read_status', function(req, res){
  if (!checkForAccessToken(req, res)) {
    return;
  }

  var read_status = req.params.read_status == "unread" ? "&read=false" : "";
  var path = '/api/v2/feed_items/list?'+read_status+'&access_token=' + req.session.access_token;
  feedWranglerRequest(path, true, function(jsonResponse,path) {
    if ( jsonResponse != null ) {
      jsonResponse.access_token = req.session.access_token;
      jsonResponse.feeds = req.session.feeds;
      jsonResponse.read_later_service = req.session.read_later_service;
      jsonResponse.streams = req.session.streams;

      /* Count number of unread feed items per feed */
      var count = {};
      for (item in jsonResponse.feed_items) { 
        var feed_id = "feed_id"+jsonResponse.feed_items[item].feed_id;
        if (count[feed_id] == null ) {
          count[feed_id] = 1;
        } else {
          count[feed_id]++;
        }
      }
      if (path.indexOf("&read=false") != -1) {
        for (item in jsonResponse.feeds) {
          var feed_id = "feed_id"+jsonResponse.feeds[item].feed_id;
          jsonResponse.feeds[item].feed_count = count[feed_id];
        }
        jsonResponse.read_status = "Unread";
      } else {
        jsonResponse.read_status = "All";
      }
      res.render('index', jsonResponse);
    } else {
      req.session.access_token = null;
      res.clearCookie('access_token');
      res.redirect('');
    }
  });
});


//Simple redirectors
app.get('/feeds', function(req, res){
    res.redirect('/feeds/unread/');
});
app.get('/starred', function(req, res){
  res.redirect('/starred/all');
});
app.get('/all', function(req, res){
  res.redirect('/feeds/all');
});
app.get('/unread', function(req, res){
  res.redirect('/feeds/unread');
});
/* 404 page */
app.get('*', function(req, res){
  res.redirect('');
});

http.createServer(app).listen(3000);
console.log('Listening on port 3000');
