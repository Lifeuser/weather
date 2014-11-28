var http = require('http'),
    Step = require('step'),
    redis = require('redis'),
    request = require('request');
    url = require('url'),
    querystring = require('querystring'),
    redis_client = redis.createClient(),
    _MS_PER_DAY = 1000 * 60 * 60 * 24,

    API = {
        OpenWeatherMap: {
            url: 'http://api.openweathermap.org/data/2.5/forecast/daily/?',
        },
        WorldWeatherOnline: {
            url: 'http://api.worldweatheronline.com/free/v2/weather.ashx/?',
            key: '9ed2e8b6575c3745c3b21b109dde2'
        }
    }

function dateDiffInDays(a, b) {
  var utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  var utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

  return Math.floor((utc2 - utc1) / _MS_PER_DAY);
}

function makeQueryString (apiName, city, date) {
    var obj;

    if(apiName === 'OpenWeatherMap') {
        obj = {
            q: city,
            mode: 'json',
            units: 'metric',
            cnt: date //15
        }
    }

    if(apiName === 'WorldWeatherOnline') {
        obj = {
            q: city,
            format: 'json',
            date: date, //2014-12-03
            key: '9ed2e8b6575c3745c3b21b109dde2'
        }
    }

    return querystring.stringify(obj);
}

http.createServer(function (req, res) {
    if (req.url === '/favicon.ico') {
        res.writeHead(200, {'Content-Type': 'image/x-icon'});
        res.end();
        return;
    }

    var query = url.parse(req.url, true).query,
        date = new Date(query.date),
        currentDate = new Date(),
        dateDiff = Math.abs(dateDiffInDays(date, currentDate));

    if(dateDiff > 15) {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Weather forecast availible only for 15 days ahead!');
        return;
    }

    var key = (query.city).toLowerCase() + query.date;

    Step(
        function checkRedis () {
            redis_client.get(key, this);
        },
        function proceed (err, result) {
            if(err) {
                console.log(err);
            }

            if(result){
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end({"average temperature": total});
                return;
            }

            this();
        },
        function APIrequests () {
            request(API.OpenWeatherMap.url + makeQueryString('OpenWeatherMap', query.city, dateDiff + 1), this.parallel());
            request(API.WorldWeatherOnline.url + makeQueryString('WorldWeatherOnline', query.city, query.date), this.parallel());
        },
        function data (err, response1, response2){
            if(err) {
                console.log(err);
                res.writeHead(200, {'Content-Type': 'text/plain'});
                res.end(err);
                return;
            }

            if(response1.statusCode === 200 & response2.statusCode === 200){
                var body1 = JSON.parse(response1.body);
                var body2 = JSON.parse(response2.body);

                var average1 = (body1.list[dateDiff].temp.min + body1.list[dateDiff].temp.max) / 2;
                var average2 = (parseInt(body2.data.weather[0].mintempC) + parseInt(body2.data.weather[0].maxtempC)) / 2;

                var total = (average1 + average2) / 2;

                res.writeHead(200, {'Content-Type': 'application/json'});
                res.end(JSON.stringify({"average temperature": total}));
                this(total);
            }
        },
        function cashe (total) {
            redis_client.setex(key, 3600, total, this)
        },
        function (err) {
            if(err){
                console.log('cashing failed', err);
            }
        }
    );

}).listen(1337);

console.log('Server is running on 1337');

