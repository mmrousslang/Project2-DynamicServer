// Built-in Node.js modules
let fs = require('fs');
let path = require('path');

// NPM modules
let express = require('express');
let sqlite3 = require('sqlite3');
const { resolve } = require('path');


let public_dir = path.join(__dirname, 'public');
let template_dir = path.join(__dirname, 'templates');
let db_filename = path.join(__dirname, 'db', 'usenergy.sqlite3');

let app = express();
let port = 8000;

// open usenergy.sqlite3 database
let db = new sqlite3.Database(db_filename, sqlite3.OPEN_READONLY, (err) => {
    if (err) {
        console.log('Error opening ' + db_filename);
    }
    else {
        console.log('Now connected to ' + db_filename);
    }
});

app.use(express.static(public_dir)); // serve static files from 'public' directory


// GET request handler for home page '/' (redirect to /year/2018)
app.get('/', (req, res) => {
    res.redirect('/year/2018');
});

// GET request handler for '/year/*'
app.get('/year/:selected_year', (req, res) => {
    let year = req.params.selected_year;
    //invalid year requested
    if((year > 2018 || year < 1960) || isNaN(year)){
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.write('Error: no data for the year '+year);
        res.end();
    }
    readFile(path.join(template_dir, 'year.html')).then((template) => {
        //replace year
        template = template.replace('!YEAR!', year);
        template = template.replace("var year", "var year = "+year);
        //replace prev and next
        let yearprev = parseInt(year)-1;
        let yearnext = parseInt(year)+1;
        if(year == 1960) {
            yearprev = 2018;
        }
        if(year == 2018) {
            yearnext = 1960;
        }
        template = template.replace("!PREV!", "<a href='/year/"+yearprev+ "' target='_self'>PREV</a>");
        template = template.replace("!NEXT!", "<a href='/year/"+yearnext+ "' target='_self'>NEXT</a>");

        let myPromise = new Promise((resolve, reject) => {
            db.all("SELECT * FROM Consumption WHERE year = ?", year, (err, rows) => {
                template = yearTable(template, rows, year);
                resolve();
            });
        });

        Promise.all([myPromise]).then((values) => {
           res.status(200).type('html').send(template);
        }).catch((err) => {
            res.writeHead(404, {'Content-Type':'text/plain'});
            res.write('Error: file not found');
            res.end();
        })
    });
});

// GET request handler for '/state/*'
app.get('/state/:selected_state', (req, res) => {
    let abbreviation = req.params.selected_state;
    if((Object.keys(prevNextState).includes(abbreviation))){//abbreviation is in db
        readFile(path.join(template_dir, 'state.html')).then((template) => {
            template = template.replace("!STATEIMG!", "<img src = '/images/states/"+abbreviation+".jpg', alt = '"+abbreviation+" picture'/>");            
            let statePromise = new Promise((resolve, reject) => {
                db.get("SELECT state_name FROM States WHERE state_abbreviation = ?", abbreviation, (err, row) => {
                    let fullState = row.state_name;
                    template = template.replace("!STATENAME!", fullState);
                    template = template.replace("var state", "var state = '"+fullState+"'");
                    //populate state next and prev buttons
                    template = template.replace("!PREV!", "<a href='/state/"+prevNextState[abbreviation].prev+ "' target='_self'>PREV</a>");
                    template = template.replace("!NEXT!", "<a href='/state/"+prevNextState[abbreviation].next+ "' target='_self'>NEXT</a>");
                    resolve();
                });
            });

            let consumptionPromise = new Promise((resolve, reject) => {
                db.all("SELECT * FROM Consumption WHERE state_abbreviation = ?", abbreviation, (err, rows) => {
                    template = stateTable(template, rows, abbreviation);
                    template = stateConsumption(template, rows);
                    resolve();
                });
            });

            Promise.all([statePromise, consumptionPromise]).then((values) => {
                res.status(200).type('html').send(template); 
            }).catch((err) => {
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.write('Error: file not found');
                res.end();
            });
        })
    } else {
        //error - state not valid
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.write('Error: no data for the state '+abbreviation);
        res.end();
    }
});

// GET request handler for '/energy/*'
app.get('/energy/:selected_energy_source', (req, res) => {
    let energy_type = req.params.selected_energy_source
    if((Object.keys(prev_next_energy).includes(energy_type))){//energy_type is in db)
        fs.readFile(path.join(template_dir, 'energy.html'), "utf-8", (err, template) => {
            let capitalEnergyType;
            if(energy_type == "natural_gas"){
                capitalEnergyType = "Natural Gas";
            }else {
                capitalEnergyType = energy_type.charAt(0).toUpperCase() + energy_type.slice(1);
            }
            
            template = template.replace("var energy_type", "var energy_type = '"+capitalEnergyType+"'");
            template = template.replace("__Energytype__", capitalEnergyType);
            template = template.replace("__ENERGYIMG__", "<img src = '/images/energy/"+energy_type+".png', alt = '"+energy_type+" pic'/>");
            template = template.replace("__PREVIOUS__", "<a href='/energy/"+prev_next_energy[energy_type].prev+ "' target='_self'>PREVIOUS</a>");
            template = template.replace("__NEXT__", "<a href='/energy/"+prev_next_energy[energy_type].next+ "' target='_self'>NEXT</a>");

            let energyPromise = new Promise((resolve, reject) => {
                db.all("SELECT state_abbreviation, "+energy_type+" FROM Consumption GROUP BY state_abbreviation, year", (err, rows) => {
                    template = energyTable(template, rows, energy_type);
                    resolve();
                });
            });

            Promise.all([energyPromise]).then((values) => {
                res.status(200).type('html').send(template); 
            }).catch((err) => {
                res.writeHead(404, {'Content-Type': 'text/plain'});
                res.write('Error: file not found');
                res.end();
            });
        });
    } else {
        //error - energy not valid
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.write('Error: no data for the energy '+energy_type);
        res.end();
    }
});

//prev and next for energy
let prev_next_energy = {
    coal: {prev: "renewable", next: "natural_gas"},
    natural_gas: {prev: "coal", next: "nuclear"},
    nuclear: {prev: "natural_gas", next: "petroleum"},
    petroleum: {prev: "nuclear", next: "renewable"},
    renewable: {prev: "petroleum", next: "coal"}
}

//prev and next for state
let prevNextState = {
    AK:{prev:"WY", next:"AL"}, //1
    AL:{prev:"AK", next:"AR"}, //2
    AR:{prev:"AL", next:"AZ"}, //3
    AZ:{prev:"AR", next:"CA"}, //4
    CA:{prev:"AZ", next:"CO"}, //5
    CO:{prev:"CA", next:"CT"}, //6
    CT:{prev:"CO", next:"DC"}, //7
    DC:{prev:"CT", next:"DE"}, //8
    DE:{prev:"DC", next:"FL"}, //9
    FL:{prev:'DE',next:'GA'}, //10
    GA:{prev:'FL',next:'HI'}, //11
    HI:{prev:'GA',next:'IA'}, //12
    IA:{prev:'HI',next:'ID'}, //13
    ID:{prev:'IA',next:'IL'}, //14
    IL:{prev:'ID',next:'IN'}, //15
    IN:{prev:'IL',next:'KS'}, //16
    KS:{prev:'IN',next:'KY'}, //17
    KY:{prev:'KS',next:'LA'}, //18
    LA:{prev:'KY',next:'MA'}, //19
    MA:{prev:'LA',next:'MD'}, //20
    MD:{prev:'MA',next:'ME'}, //21
    ME:{prev:'MD',next:'MI'}, //22
    MI:{prev:'ME',next:'MN'}, //23
    MN:{prev:'MI',next:'MO'}, //24
    MO:{prev:'MN',next:'MS'}, //25
    MS:{prev:'MO',next:'MT'}, //26
    MT:{prev:'MS',next:'NC'}, //27
    NC:{prev:'MT',next:'ND'}, //28
    ND:{prev:'NC',next:'NE'}, //29
    NE:{prev:'ND',next:'NH'}, //30
    NH:{prev:'NE',next:'NJ'}, //31
    NJ:{prev:'NH',next:'NM'}, //32
    NM:{prev:'NJ',next:'NV'}, //33
    NV:{prev:'NM',next:'NY'}, //34
    NY:{prev:'NV',next:'OH'}, //35
    OH:{prev:'NY',next:'OK'}, //36
    OK:{prev:'OH',next:'OR'}, //37
    OR:{prev:'OK',next:'PA'}, //38
    PA:{prev:'OR',next:'RI'}, //39
    RI:{prev:'PA',next:'SC'}, //40
    SC:{prev:'RI',next:'SD'}, //41
    SD:{prev:'SC',next:'TN'}, //42
    TN:{prev:'SD',next:'TX'}, //43
    TX:{prev:'TN',next:'UT'}, //44
    UT:{prev:'TX',next:'VA'}, //45
    VA:{prev:'UT',next:'VT'}, //46
    VT:{prev:'VA',next:'WA'}, //47
    WA:{prev:'VT',next:'WI'}, //48
    WI:{prev:'WA',next:'WV'}, //49
    WV:{prev:'WI',next:'WY'}, //50
    WY:{prev:'WV',next:'AK'}  //51
}

//stores total for each year for each state
let energy_counts = {
    AK:{energyCounts:[]}, //1
    AL:{energyCounts:[]}, //2
    AR:{energyCounts:[]}, //3
    AZ:{energyCounts:[]}, //4
    CA:{energyCounts:[]}, //5
    CO:{energyCounts:[]}, //6
    CT:{energyCounts:[]}, //7
    DC:{energyCounts:[]}, //8
    DE:{energyCounts:[]}, //9
    FL:{energyCounts:[]}, //10
    GA:{energyCounts:[]}, //11
    HI:{energyCounts:[]}, //12
    IA:{energyCounts:[]}, //13
    ID:{energyCounts:[]}, //14
    IL:{energyCounts:[]}, //15
    IN:{energyCounts:[]}, //16
    KS:{energyCounts:[]}, //17
    KY:{energyCounts:[]}, //18
    LA:{energyCounts:[]}, //19
    MA:{energyCounts:[]}, //20
    MD:{energyCounts:[]}, //21
    ME:{energyCounts:[]}, //22
    MI:{energyCounts:[]}, //23
    MN:{energyCounts:[]}, //24
    MO:{energyCounts:[]}, //25
    MS:{energyCounts:[]}, //26
    MT:{energyCounts:[]}, //27
    NC:{energyCounts:[]}, //28
    ND:{energyCounts:[]}, //29
    NE:{energyCounts:[]}, //30
    NH:{energyCounts:[]}, //31
    NJ:{energyCounts:[]}, //32
    NM:{energyCounts:[]}, //33
    NV:{energyCounts:[]}, //34
    NY:{energyCounts:[]}, //35
    OH:{energyCounts:[]}, //36
    OK:{energyCounts:[]}, //37
    OR:{energyCounts:[]}, //38
    PA:{energyCounts:[]}, //39
    RI:{energyCounts:[]}, //40
    SC:{energyCounts:[]}, //41
    SD:{energyCounts:[]}, //42
    TN:{energyCounts:[]}, //43
    TX:{energyCounts:[]}, //44
    UT:{energyCounts:[]}, //45
    VA:{energyCounts:[]}, //46
    VT:{energyCounts:[]}, //47
    WA:{energyCounts:[]}, //48
    WI:{energyCounts:[]}, //49
    WV:{energyCounts:[]}, //50
    WY:{energyCounts:[]}  //51
}

//dynamically fills enery table
function energyTable(template, rows){
    let tBody = "";
    let row;
    let col;
    let total = 0;
    let year = 1960;
    let counter = 1;
    let counts = [];
    tBody = tBody + "<tr>" + "<td>"+year+"</td>";
    
    for(let i = 0; i < rows.length; i++){
        
        row = rows[i];
        for(col of Object.keys(row)){
            if(col == "state_abbreviation"){
                state = row[col];
            }
            if(col !== "state_abbreviation"){
                tBody = tBody + "<td>" + row[col] + "</td>";
                total = total+row[col];
                energy_counts[state].energyCounts.push(row[col]);
                if (counter == 51){
                    counter = 0;
                    year = year + 1;
                    tBody = tBody + "<td>" + total + "</td>";
                    total = 0;
                    if(year == 2019){
                        break;
                    }
                    tBody = tBody + "</tr><tr>" + "<td>"+year+"</td>";
                }
                
                counter = counter + 1;
            }
        }
    }
    for (entry in energy_counts){
        counts = counts + entry+": ["+energy_counts[entry].energyCounts+"], ";
    }

    counts = "{"+counts+"}"
    template = template.replace("var energy_counts", "var energy_counts = "+counts);
    template = template.replace("__DATA__", tBody);
    return template;
}

//dynamically populates the state table
function stateTable(template, rows){
    let tBody = "";
    let row;
    let col;
    let total;

    for(let i = 0; i < rows.length; i++){
        row = rows[i];
        total = 0;
        tBody = tBody + "<tr>";

        for(col of Object.keys(row)){
            if(col !== "state_abbreviation") {
                tBody = tBody + "<td>" + row[col] + "</td>";
                
                if(col !== "year"){
                    total = total + row[col];
                }else {
                    total = total;
                }
            }
        }
        tBody = tBody + "<td>" + total + "</td>";
        tBody = tBody + "</tr>";
    }

    template = template.replace("!STATETABLE!", tBody);
    return template;
}

//populates js variables in state template
function stateConsumption(template, rows){
    let coal_counts = [];
    let natural_gas_counts = [];
    let nuclear_counts = [];
    let petroleum_counts = [];
    let renewable_counts = [];
    let row;

    for(let i = 0; i < rows.length; i++){
        row = rows[i];
        coal_counts.push(row.coal);
        natural_gas_counts.push(row.natural_gas);
        nuclear_counts.push(row.nuclear);
        petroleum_counts.push(row.petroleum);
        renewable_counts.push(row.renewable);
    }

    //js vars populated
    template = template.replace("var coal_counts", "var coal_counts = ["+coal_counts+"]");
    template = template.replace("var natural_gas_counts", "var natural_gas_counts = ["+natural_gas_counts+"]");
    template = template.replace("var nuclear_counts", "var nuclear_counts = ["+nuclear_counts+"]");
    template = template.replace("var petroleum_counts", "var petroleum_counts = ["+petroleum_counts+"]");
    template = template.replace("var renewable_counts", "var renewable_counts = ["+renewable_counts+"]");

    return template;
}

function readFile(filename){
    return new Promise((resolve, reject) => {
        fs.readFile(filename, (err, data) => {
            if(err) {
                reject(err);
            } else {
                resolve(data.toString());
            }
        });
    });
}

//dynamically populates year table
function yearTable(template, rows, year){
    let tBody = "";
    let row;
    let col;
    let total;
    let coal_count = 0;
    let natural_gas_count = 0;
    let nuclear_count = 0;
    let petroleum_count = 0;
    let renewable_count = 0;


    for(let i = 0; i < rows.length; i++){
        row = rows[i];
        total = 0;
        tBody = tBody + "<tr>";

        for(col of Object.keys(row)){
            if(col !== "year") {
                if(col == "coal"){
                    coal_count = coal_count + row[col];
                }else if(col == "natural_gas"){
                    natural_gas_count = natural_gas_count + row[col];
                }else if(col == "nuclear"){
                    nuclear_count = nuclear_count + row[col];
                }else if(col == "petroleum"){
                    petroleum_count = petroleum_count + row[col];
                }else if(col == "renewable"){
                    renewable_count = renewable_count + row[col];
                }
                tBody = tBody + "<td>" + row[col] + "</td>";
                if(col !== "state_abbreviation"){
                    total = total + row[col];
                }
            }
        }
        tBody = tBody + "<td>" + total + "</td>";
        tBody = tBody + "</tr>";
    }

    //replace java script variables
    template = template.replace("!YEARTABLE!", tBody);
    template = template.replace("var coal_count", "var coal_count = "+coal_count);
    template = template.replace("var natural_gas_count", "var natural_gas_count = "+natural_gas_count);
    template = template.replace("var nuclear_count", "var nuclear_count = "+nuclear_count);
    template = template.replace("var petroleum_count", "var petroleum_count = "+petroleum_count);
    template = template.replace("var renewable_count", "var renewable_count = "+renewable_count);
    return template;
}

app.listen(port, () => {
    console.log('Now listening on port ' + port);
});