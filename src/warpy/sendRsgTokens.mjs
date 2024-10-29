import { backOff } from 'exponential-backoff';
import { defaultCacheOptions, WarpFactory } from 'warp-contracts';

const dreWarpyUrl = `https://dre-warpy.warp.cc`;
const apiWarpyUrl = `https://api-warpy.warp.cc`;
const membersBatch = 4;

export async function sendRsgTokens(rsg, processId) {
  const request = async () => {
    if (!rsg.recipients) {
      console.log(`no recipients found`, rsg);
      return;
    }
    const addresses = Object.keys(rsg.recipients);

    if (addresses.length == 0) {
      console.log('no recipients found in the external tokens map');
      return;
    }

    console.log('found new Warpy external tokens recipients', addresses);

    try {
      const usersIds = await getWarpyUsersIds(addresses);
      if (!usersIds) {
        console.log(`could not get Warpy external tokens user ids`);
        return;
      }
      console.log(`users ids assigned to the recipients of Warpy external tokens`, usersIds);

      const ids = Object.keys(usersIds).map((a) => usersIds[a.toLowerCase()]);
      if (ids.length == 0) {
        console.log('none of the recipients is registered in Warpy, leaving');
        return;
      }

      const usersRoles = await getWarpyUsersRoles(ids);
      console.log(`users roles assigned to the Warpy ids`, usersRoles);

      const addressToRolesBatches = mapAddressToRolesBatches(addresses, usersIds, usersRoles);
      console.log(`users roles assigned to the Warpy external tokens recipients`, addressToRolesBatches);

      const results = (await Promise.all(addressToRolesBatches
          .map((addressToRoles) => writeInteractionToWarpy(rsg, addressToRoles))))
          .map((response) => response?.originalTxId);

      console.log(`interactions sent to Warpy, processId ${processId}`, results);
    } catch (e) {
      console.error(`error while sending Warpy external tokens, processId ${processId}`, e);
      return Promise.reject(e);
    }
  };

  try {
    await backOff(request, {
      delayFirstAttempt: false,
      maxDelay: 2000,
      numOfAttempts: 5,
    });
  } catch (error) {
    throw new Error(`Unable to send Warpy external tokens, processId ${processId}. ${error}`);
  }
}

async function getWarpyUsersIds(addresses) {
  return (
    await fetch(`${dreWarpyUrl}/warpy/fixed/user-ids`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({ addresses }),
    }).then((res) => res.json())
  )?.['wallet_to_id'];
}

async function getWarpyUsersRoles(ids) {
  return (
    await fetch(`${apiWarpyUrl}/v1/usersRoles?ids=${ids}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        Accept: 'application/json',
      },
      body: JSON.stringify({ ids }),
    }).then((res) => res.json())
  )?.['id_to_roles'];
}

function mapAddressToRolesBatches(addresses, usersIds, usersRoles) {
  const batch = [];
  let addressToRoles = {};
  let i = 0;
  for (let address of addresses) {
    const userId = usersIds[address.toLowerCase()];
    if (userId) {
      addressToRoles[address] = usersRoles[userId];
      i++;
      if (i >= membersBatch) {
        batch.push(addressToRoles);
        addressToRoles = {};
        i = 0;
      }
    }
  }
  if (Object.keys(addressToRoles).length > 0) {
    batch.push(addressToRoles);
  }

  return batch;
}

async function writeInteractionToWarpy(rsg, addressToRoles) {
  const warp = WarpFactory.forMainnet({ ...defaultCacheOptions, inMemory: true });
  const contract = warp
    .contract(rsg.id)
    .setEvaluationOptions({
      sequencerUrl: 'https://gw.warp.cc/',
    })
    .connect(JSON.parse(process.env.NODE_JWK_KEY));

  const members = Object.entries(addressToRoles).map(([address, roles]) => {
    return {
      id: address,
      roles: roles || [],
      points:
        parseInt(rsg.recipients[Object.keys(rsg.recipients).find((r) => r.toLowerCase() == address.toLowerCase())]) ||
        0,
    };
  });

  const addPointsInput = {
    function: 'addPointsForAddress',
    adminId: '769844280767807520',
    members,
    noBoost: false,
    points: 0,
  };
  console.log(`writing interaction to Warpy..., ${JSON.stringify(addPointsInput)}`);
  return await contract.writeInteraction(addPointsInput);
}
